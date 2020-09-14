const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const app = express();
const fs = require('fs');
const { spawn } = require('child_process');
const { Webhooks } = require('@octokit/webhooks');
const { Octokit } = require('@octokit/rest');
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    userAgent: 'v8-riscv CI v1.0.0',
});

const webhooks = new Webhooks({
    secret: process.env.WEBHOOK_SECRET,
});

// Create the logs directory if it does not already exist
var logDir = './logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// Read the configuration file
var config = JSON.parse(fs.readFileSync('config.json'));

// When the PR is opened or edited by an approved user, run the build and test
webhooks.on("pull_request", ({ id, name, payload }) => {
    if (payload.repository.full_name != `${config.owner}/${config.repo}` ||
        !(payload.action == "opened" || payload.action == "edited") ||
        !octokit.orgs.checkMembershipForUser({ org: config.owner, username: payload.pull_request.user.login })) {
        console.log(`Ignoring PR #${payload.number} ${payload.action} by ${payload.pull_request.user.login}`);
        return;
    }

    console.log(`Testing ${payload.repository.full_name} PR #${payload.number}`);
    runAndReportStatus(payload.number, payload.pull_request.head.sha);
});

// When a PR is approved by an approved user, run the build and test
webhooks.on("pull_request_review", ({ id, name, payload }) => {
    if (payload.repository.full_name != `${config.owner}/${config.repo}` ||
        payload.review.state != "approved" ||
        // If the reviewer is not approved
        !octokit.orgs.checkMembershipForUser({ org: config.owner, username: payload.review.user.login }) ||
        // If the PR user is approved (already tested)
        octokit.orgs.checkMembershipForUser({ org: config.owner, username: payload.pull_request.user })) {
        console.log(`Ignoring ${payload.repository.full_name} PR #${payload.pull_request.number}: ${payload.review.user.login} ${payload.review.state}`);
        return;
    }

    console.log(`Testing ${payload.repository.full_name} PR #${payload.pull_request.number}`);
    runAndReportStatus(payload.pull_request.number, payload.pull_request.head.sha);
});

function runAndReportStatus(prNum, sha) {
    let timestamp = (new Date()).toISOString();
    const logfile = `${prNum}-${timestamp}.log`;
    var logStream = fs.createWriteStream(`./logs/${logfile}`);

    console.log("Send pending");
    octokit.repos.createCommitStatus({
        owner: config.owner,
        repo: config.repo,
        sha: sha,
        state: "pending",
        target_url: `${process.env.BASE_URL}/logs/${logfile}`,
        description: "Building",
        context: "ci"
    });

    console.log("Build");
    var build = spawn('docker', ['build', '-t', `${config.owner}/${config.repo}:${prNum}`, '--build-arg', `pr_num=${prNum}`, '.']);
    build.stdout.pipe(logStream);
    build.stderr.pipe(logStream);
    build.on('close', function (code) {
        if (code != 0) {
            console.log("Send failure");
            octokit.repos.createCommitStatus({
                owner: config.owner,
                repo: config.repo,
                sha: sha,
                state: "failure",
                target_url: `${process.env.BASE_URL}/logs/${logfile}`,
                description: "Build failure",
                context: "ci"
            });
        } else {
            console.log("Run");
            octokit.repos.createCommitStatus({
                owner: config.owner,
                repo: config.repo,
                sha: sha,
                state: "pending",
                target_url: `${process.env.BASE_URL}/logs/${logfile}`,
                description: "Running tests",
                context: "ci"
            });

            logStream = fs.createWriteStream(`./logs/${logfile}`, { flags: 'a' });
            var run = spawn('docker', ['run', `${config.owner}/${config.repo}:${prNum}`]);
            run.stdout.pipe(logStream);
            run.stderr.pipe(logStream);
            run.on('close', function (code) {
                if (code != 0) {
                    console.log("Send failure");
                    octokit.repos.createCommitStatus({
                        owner: config.owner,
                        repo: config.repo,
                        sha: sha,
                        state: "failure",
                        target_url: `${process.env.BASE_URL}/logs/${logfile}`,
                        description: "Test failure",
                        context: "ci"
                    });
                } else {
                    console.log("Send success");
                    octokit.repos.createCommitStatus({
                        owner: config.owner,
                        repo: config.repo,
                        sha: sha,
                        state: "success",
                        target_url: `${process.env.BASE_URL}/logs/${logfile}`,
                        description: "Success",
                        context: "ci"
                    });
                }
            });
        }
    });
}

app.use('/hooks', webhooks.middleware);
app.use('/logs', express.static('logs'));
const server = app.listen(8000);