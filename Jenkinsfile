
pipeline {

    // Run on any available agent
    agent any

    environment {

        DEPLOY_WEBHOOK = credentials('cloud-deploy-webhook-url') 

        BACKEND_DIR    = 'backend'
    }

    // ── Pipeline-wide options ────────────────────────────────────────────────
    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        timestamps()
    }

    triggers {
        pollSCM('* * * * *') 
    }

    stages {

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
                        python3.11 -m venv attend_snap_venv

                        # Use explicit venv paths — no reliance on 'source activate'
                        attend_snap_venv/bin/pip3.11 install --quiet flake8
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
                    junit allowEmptyResults: true, testResults: 'backend/test-results/*.xml'
                }
            }
        }

        // ── 4. Build Docker Image ─────────────────────────────────────────────
        stage('Build Docker Image') {
            steps {
                dir(BACKEND_DIR) {
                    sh '''
                        echo "🐳 Building Docker image..."
                        DOCKER_BUILDKIT=0 docker build \
                            -t "flashadking/attendsnap:$BUILD_NUMBER" \
                            -t "flashadking/attendsnap:latest" \
                            -f Dockerfile \
                            .
                        echo "✅ Image built: flashadking/attendsnap:$BUILD_NUMBER"
                    '''
                }
            }
        }

        // ── 5. Push to Docker Hub ─────────────────────────────────────────────
        stage('Push to Docker Hub') {
            steps {
                sh '''
                    echo "📤 Pushing images..."
                    docker push "flashadking/attendsnap:$BUILD_NUMBER"
                    docker push "flashadking/attendsnap:latest"

                    echo "✅ Images pushed successfully."
                '''
            }
        }

        stage('Trigger Cloud Deploy') {
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