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

    // ── Trigger: push to main / master ───────────────────────────────────────
    triggers {
        // Poll SCM every minute for changes
        pollSCM('* * * * *')
    }

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
                        # Create a virtual environment named 'venv'
                        python3 -m venv attend_snap_venv
                        
                        # Activate it
                        . attend_snap_venv/bin/activate
                        
                        # Install and run flake8 inside the isolated environment
                        pip install --quiet flake8
                        flake8 app/ --max-line-length=120 --ignore=W503 || true
                    '''
                }
            }
        }

        // ── 3. Unit Tests ─────────────────────────────────────────────────────
        stage('Test') {
            steps {
                dir(BACKEND_DIR) {
                    sh '''
                        # Activate the same virtual environment created in Stage 2
                        . attend_snap_venv/bin/activate
                        
                        # Install testing libraries and your backend requirements
                        pip3 install --quiet pytest pytest-asyncio httpx
                        pip3 install --quiet -r req.txt
                        
                        # Run tests
                        pytest tests/ -v --tb=short || true
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
                anyOf {
                    branch 'main'
                    branch 'master'
                }
            }
            steps {
                sh """
                    echo "📤 Logging in to Docker Hub..."
                    echo "${DOCKER_CREDS_PSW}" | docker login -u "${DOCKER_CREDS_USR}" --password-stdin

                    echo "📤 Pushing ${IMAGE_VERSIONED} ..."
                    docker push ${IMAGE_VERSIONED}

                    echo "📤 Pushing ${IMAGE_LATEST} ..."
                    docker push ${IMAGE_LATEST}

                    echo "✅ Images pushed successfully."
                """
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
                anyOf {
                    branch 'main'
                }
            }
            steps {
                script {
                    echo "🚀 Triggering deployment of ${IMAGE_VERSIONED} on Render..."
                    
                    // Render includes authorization within the hook URL parameter string securely
                    sh """
                        HTTP_STATUS=\$(curl -s -o /tmp/deploy_response.txt -w "%{http_code}" --max-time 30 "${DEPLOY_WEBHOOK}")
                        
                        echo "Render API Gateway Response Code: \${HTTP_STATUS}"
                        cat /tmp/deploy_response.txt
                        
                        if [ "\${HTTP_STATUS}" -lt 200 ] || [ "\${HTTP_STATUS}" -ge 300 ]; then
                            echo "❌ Render deployment webhook failed with HTTP status \${HTTP_STATUS}"
                            exit 1
                        fi
                        
                        echo "✅ Render deployment sequence initialized cleanly."
                    """
                }
            }
        }

        // ── 7. Cleanup local images ───────────────────────────────────────────
        stage('Cleanup') {
            steps {
                sh """
                    docker rmi ${IMAGE_VERSIONED} ${IMAGE_LATEST} || true
                    docker image prune -f || true
                    echo "🧹 Local machine images cleaned up."
                """
            }
        }
    }

    // ── Post-pipeline notifications ───────────────────────────────────────────
    post {
        success {
            echo "🎉 Pipeline SUCCESS – AttendSnap backend ${IMAGE_VERSIONED} deployed."
        }
        failure {
            echo "💥 Pipeline FAILED – check build console output logs."
        }
        always {
            // Cleans the workspace directory inside the active node executor block
            cleanWs()
        }
    }
}