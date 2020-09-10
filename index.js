const dotenv = require('dotenv');
dotenv.config();
const { execSync } = require("child_process");
const { Webhooks } = require("@octokit/webhooks");
const { Octokit } = require("@octokit/rest");
const { executionAsyncId } = require('async_hooks');
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    userAgent: 'v8-riscv CI v1.0.0',
});

const webhooks = new Webhooks({
    secret: process.env.WEBHOOK_SECRET,
});

webhooks.on("pull_request_review", ({ id, name, payload }) => {
    console.log(name, "event received");
    console.log("state is", payload.review.state);
    console.log("number:", payload.pull_request.number)
    if (payload.repository.full_name != "v8-riscv/v8" ||
        payload.review.state != "approved") {
        console.log(`Ignoring ${payload.repository.full_name} !${payload.pull_request.number}: ${payload.review.state}`);
        return;
    }
    runAndReportStatus(payload.pull_request.number, payload.pull_request.head.sha);
});

async function runAndReportStatus(prNum, sha) {
    console.log("Send pending");
    await octokit.repos.createCommitStatus({
        owner: "v8-riscv",
        repo: "v8",
        sha: sha,
        state: "pending",
        description: "Pending",
        context: "ci"
    });
    console.log("Run");
    let rc = buildAndRun(prNum);
    if (rc == 0) {
        console.log("Send success");
        await octokit.repos.createCommitStatus({
            owner: "v8-riscv",
            repo: "v8",
            sha: sha,
            state: "success",
            description: "Success",
            context: "ci"
        });
    } else {
        console.log("Send failure");
        await octokit.repos.createCommitStatus({
            owner: "v8-riscv",
            repo: "v8",
            sha: sha,
            state: "failure",
            description: "Failure",
            context: "ci"
        });
    }
}

function buildAndRun(prNum) {
    try {
        execSync(`docker build -t v8-riscv/v8:${prNum} --build-arg pr_num=${prNum} .`);
        execSync('docker run v8-riscv/v8:${prNum}');
    } catch (error) {
        return error.status;
    }
    return 0;
}

require("http").createServer(webhooks.middleware).listen(8000);
