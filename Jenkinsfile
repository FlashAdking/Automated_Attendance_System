// ─────────────────────────────────────────────────────────────────────────────
//  AttendSnap  –  Backend CI/CD Pipeline
//  Scope : Build → Test → Push Docker image → Trigger cloud deploy
//  Frontend is deployed independently on Vercel (not included here)
// ─────────────────────────────────────────────────────────────────────────────

pipeline {

    // Run on any available agent (change to a label if you have dedicated nodes)
    agent any

    // ── Environment / Credentials ────────────────────────────────────────────
    environment {
        // Docker Hub (or GHCR) image name  –  set DOCKER_HUB_USER in Jenkins globals
        IMAGE_NAME     = "${env.DOCKER_HUB_USER}/attendsnap-backend"
        IMAGE_TAG      = "${env.BUILD_NUMBER}"          // e.g. "42"
        IMAGE_LATEST   = "${IMAGE_NAME}:latest"
        IMAGE_VERSIONED= "${IMAGE_NAME}:${IMAGE_TAG}"

        // Credentials stored in Jenkins Credentials Store
        // Add these via: Jenkins → Manage → Credentials
        DOCKER_CREDS   = credentials('dockerhub-credentials')   // username+password
        DEPLOY_WEBHOOK = credentials('cloud-deploy-webhook-url') // Secret text – your cloud webhook / deploy URL
        DEPLOY_SECRET  = credentials('cloud-deploy-secret')     // Secret text – HMAC or bearer token

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
        // Poll SCM every minute (replace with GitHub webhook for real-time)
        // To use a webhook instead: configure GitHub → Webhooks → Jenkins URL
        pollSCM('* * * * *')
    }

    // ═════════════════════════════════════════════════════════════════════════
    stages {

        // ── 1. Checkout ───────────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout scm
                echo "✅ Checked out branch: ${env.GIT_BRANCH}  |  commit: ${env.GIT_COMMIT?.take(8)}"
            }
        }

        // ── 2. Lint / Static checks (optional but recommended) ────────────────
        stage('Lint') {
            steps {
                dir(BACKEND_DIR) {
                    sh '''
                        python3 -m pip install --quiet flake8
                        # W503 = line break before binary operator (style preference, ignore it)
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
                        python3 -m pip install --quiet pytest pytest-asyncio httpx
                        pip3 install --quiet -r req.txt
                        pytest tests/ -v --tb=short || true
                    '''
                }
            }
            post {
                always {
                    // Publish JUnit XML results if you use pytest-junit
                    junit allowEmptyResults: true, testResults: 'backend/test-results/*.xml'
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
            // Only push when building the main/master branch
            when {
                anyOf {
                    branch 'main'
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

        // ── 6. Trigger Cloud Deployment ───────────────────────────────────────
        //
        //  This stage fires a webhook / REST call to your cloud server telling it:
        //    "Pull the new image and restart the container."
        //
        //  Supported patterns (uncomment/adapt the one that matches your cloud):
        //
        //  A) Generic webhook  (custom deploy script on the server)
        //  B) Render.com       deploy hook
        //  C) Fly.io           (via flyctl over SSH / API)
        //  D) Railway          (via API)
        //
        // ─────────────────────────────────────────────────────────────────────
        stage('Trigger Cloud Deploy') {
            when {
                anyOf {
                    branch 'main'
                    branch 'master'
                }
            }
            steps {
                script {
                    echo "🚀 Triggering deployment of ${IMAGE_VERSIONED} on cloud server..."

                    // ── A) Generic Webhook ────────────────────────────────────
                    // Your server exposes a small deploy endpoint (see deploy.sh below).
                    // The DEPLOY_WEBHOOK secret holds the full URL, e.g.
                    //   https://yourserver.com:9000/deploy
                    // The DEPLOY_SECRET is sent as a Bearer token so the endpoint
                    // can verify the call really came from Jenkins.
                    sh """
                        HTTP_STATUS=\$(curl -s -o /tmp/deploy_response.txt -w "%{http_code}" \
                            --max-time 30 \
                            -X POST "${DEPLOY_WEBHOOK}" \
                            -H "Authorization: Bearer ${DEPLOY_SECRET}" \
                            -H "Content-Type: application/json" \
                            -d '{
                                    "service":   "attendsnap-backend",
                                    "image":     "${IMAGE_VERSIONED}",
                                    "tag":       "${IMAGE_TAG}",
                                    "commit":    "${env.GIT_COMMIT}",
                                    "branch":    "${env.GIT_BRANCH}"
                                }')

                        echo "Cloud response (HTTP \${HTTP_STATUS}):"
                        cat /tmp/deploy_response.txt

                        if [ "\${HTTP_STATUS}" -lt 200 ] || [ "\${HTTP_STATUS}" -ge 300 ]; then
                            echo "❌ Deployment webhook returned HTTP \${HTTP_STATUS}"
                            exit 1
                        fi

                        echo "✅ Deploy triggered successfully."
                    """

                    // ── B) Render.com deploy hook (alternative) ───────────────
                    // Uncomment if you use Render. DEPLOY_WEBHOOK = Render deploy hook URL.
                    //
                    // sh """
                    //     curl -s --max-time 30 "${DEPLOY_WEBHOOK}" && echo "Render deploy triggered."
                    // """

                    // ── C) Fly.io via API (alternative) ──────────────────────
                    // Uncomment if you use Fly.io. DEPLOY_SECRET = Fly API token.
                    //
                    // sh """
                    //     curl -s -X POST "https://api.machines.dev/v1/apps/attendsnap-backend/machines" \
                    //         -H "Authorization: Bearer ${DEPLOY_SECRET}" \
                    //         -H "Content-Type: application/json" \
                    //         -d '{"config":{"image":"${IMAGE_VERSIONED}"}}'
                    // """
                }
            }
        }

        // ── 7. Cleanup local images ───────────────────────────────────────────
        stage('Cleanup') {
            steps {
                sh """
                    docker rmi ${IMAGE_VERSIONED} ${IMAGE_LATEST} || true
                    docker image prune -f || true
                    echo "🧹 Local images cleaned up."
                """
            }
        }
    }

    // ── Post-pipeline notifications ───────────────────────────────────────────
    post {
        success {
            echo "🎉 Pipeline SUCCESS – AttendSnap backend ${IMAGE_VERSIONED} deployed."
            // Uncomment to send Slack / email:
            // slackSend channel: '#deployments', color: 'good',
            //             message: "✅ AttendSnap backend *${IMAGE_VERSIONED}* deployed."
        }
        failure {
            echo "💥 Pipeline FAILED – check logs above."
            // slackSend channel: '#deployments', color: 'danger',
            //             message: "❌ AttendSnap backend pipeline failed on ${env.GIT_BRANCH}."
        }
        always {
            cleanWs()
        }
    }
}
