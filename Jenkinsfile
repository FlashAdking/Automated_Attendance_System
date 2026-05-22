// ─────────────────────────────────────────────────────────────────────────────
//  AttendSnap  –  Backend CI/CD Pipeline
//  Scope : Build → Test → Push Docker image → Trigger cloud deploy
//  Frontend is deployed independently on Vercel (not included here)
// ─────────────────────────────────────────────────────────────────────────────

pipeline {

    // Run on any available agent
    agent any

    // ── Environment / Credentials ────────────────────────────────────────────
    environment {
        // Docker Hub image name  –  ensure DOCKER_HUB_USER is set in Jenkins globals
        IMAGE_NAME     = "${env.DOCKER_HUB_USER}/attendsnap"
        IMAGE_TAG      = "${env.BUILD_NUMBER}"          // e.g. "42"
        IMAGE_LATEST   = "${IMAGE_NAME}:latest"
        IMAGE_VERSIONED= "${IMAGE_NAME}:${IMAGE_TAG}"

        // Credentials stored in Jenkins Credentials Store
        // Add these via: Jenkins → Manage → Credentials
        DOCKER_CREDS   = credentials('dockerhub-credentials')   // username+password
        DEPLOY_WEBHOOK = credentials('cloud-deploy-webhook-url') // Secret text – Your Render deploy hook URL

        // Paths inside the repo
        BACKEND_DIR    = 'backend'
    }

    // ── Pipeline-wide options ────────────────────────────────────────────────
    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        timestamps()
    }

    // ── Trigger: manual only ─────────────────────────────────────────────────
    // Run by clicking "Build Now" in the Jenkins UI — no automatic scheduling.

    // ═════════════════════════════════════════════════════════════════════════
    stages {

        // ── 1. Checkout ───────────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout scm
                echo "✅ Checked out branch: ${env.GIT_BRANCH}"
            }
        }

        // ── 2. Lint / Static checks ───────────────────────────────────────────
        // ── 2. Lint / Static checks ───────────────────────────────────────────
        stage('Lint') {
            steps {
                dir(BACKEND_DIR) {
                    sh '''
                        # Create isolated venv — avoids PEP 668 "externally managed" error
                        python3 -m venv attend_snap_venv

                        # Use explicit venv paths — no reliance on 'source activate'
                        attend_snap_venv/bin/pip3 install --quiet flake8
                        attend_snap_venv/bin/flake8 app/ --max-line-length=120 --ignore=W503 || true
                    '''
                }
            }
        }

        // ── 3. Unit Tests ─────────────────────────────────────────────────────
        stage('Test') {
            steps {
                dir(BACKEND_DIR) {
                    sh '''
                        # Reuse the same venv from the Lint stage
                        # Use explicit paths — reliable on PEP 668 system-managed Linux
                        attend_snap_venv/bin/pip3 install --quiet pytest pytest-asyncio httpx
                        attend_snap_venv/bin/pip3 install --quiet -r req.txt

                        # Run tests — output JUnit XML so Jenkins can display results
                        mkdir -p test-results
                        attend_snap_venv/bin/pytest tests/ -v --tb=short \
                            --junitxml=test-results/results.xml || true
                    '''
                }
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'test-results/*.xml'
                }
            }
        }

        // ── 4. Build Docker Image ─────────────────────────────────────────────
        stage('Build Docker Image') {
            steps {
                dir(BACKEND_DIR) {
                    sh """
                        echo "🐳 Building Docker image..."
                        docker build \
                            --no-cache \
                            -t ${IMAGE_VERSIONED} \
                            -t ${IMAGE_LATEST} \
                            -f Dockerfile \
                            .
                        echo "✅ Image built: ${IMAGE_VERSIONED}"
                    """
                }
            }
        }

        // ── 5. Push to Docker Hub ─────────────────────────────────────────────
        stage('Push to Docker Hub') {
            when {
                // Match both 'main' (GitHub Actions style) and 'origin/main' (local Jenkins)
                expression { env.GIT_BRANCH ==~ /.*main/ || env.GIT_BRANCH ==~ /.*master/ }
            }
            steps {
                // Use withCredentials + single-quoted sh to prevent secret leaking in logs
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-credentials',
                    usernameVariable: 'HUB_USER',
                    passwordVariable: 'HUB_PASS'
                )]) {
                    sh '''
                        echo "📤 Logging in to Docker Hub..."
                        echo "$HUB_PASS" | docker login -u "$HUB_USER" --password-stdin

                        echo "📤 Pushing images..."
                        docker push "$HUB_USER/attendsnap:$BUILD_NUMBER"
                        docker push "$HUB_USER/attendsnap:latest"

                        echo "✅ Images pushed successfully."
                    '''
                }
            }
            post {
                always {
                    sh 'docker logout || true'
                }
            }
        }

        // ── 6. Trigger Cloud Deployment (Render.com) ──────────────────────────
        stage('Trigger Cloud Deploy') {
            when {
                expression { env.GIT_BRANCH ==~ /.*main/ }
            }
            steps {
                script {
                    echo "🚀 Triggering Render deployment..."
                    // DEPLOY_WEBHOOK is a secret URL — use single-quoted sh + env var
                    withCredentials([string(credentialsId: 'cloud-deploy-webhook-url', variable: 'HOOK_URL')]) {
                        sh '''
                            HTTP_STATUS=$(curl -s -o /tmp/deploy_response.txt -w "%{http_code}" --max-time 30 "$HOOK_URL")
                            echo "Render response: ${HTTP_STATUS}"
                            cat /tmp/deploy_response.txt
                            if [ "${HTTP_STATUS}" -lt 200 ] || [ "${HTTP_STATUS}" -ge 300 ]; then
                                echo "❌ Render webhook failed: ${HTTP_STATUS}"
                                exit 1
                            fi
                            echo "✅ Render deployment triggered."
                        '''
                    }
                }
            }
        }

        // ── 7. Cleanup — runs after successful push ───────────────────────────
        stage('Cleanup') {
            steps {
                sh '''
                    echo "🧹 Removing built images..."
                    docker image rm "${IMAGE_VERSIONED}" "${IMAGE_LATEST}" 2>/dev/null || true

                    echo "🧹 Pruning dangling images & layers..."
                    docker image prune -f

                    echo "🧹 Pruning unused build cache..."
                    docker builder prune -f

                    echo "🧹 Pruning unused networks..."
                    docker network prune -f

                    echo "✅ Docker environment fully cleaned."
                '''
            }
        }
    }

    // ── Post-pipeline notifications ───────────────────────────────────────────
    post {
        success {
            echo "🎉 Pipeline SUCCESS – image pushed and Docker environment cleaned."
        }
        failure {
            // Images are intentionally kept on failure for debugging
            echo "💥 Pipeline FAILED – Docker images kept for inspection. Check console output."
        }
        always {
            // Wipe Jenkins workspace regardless of build outcome
            cleanWs()
        }
    }
}