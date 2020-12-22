const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const app = express();
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const { Webhooks } = require("@octokit/webhooks");
const { Octokit } = require("@octokit/rest");
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  userAgent: "v8-riscv CI v1.0.0",
});

const webhooks = new Webhooks({
  secret: process.env.WEBHOOK_SECRET,
});

// Create the logs directory if it does not already exist
var logDir = "./logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Read the configuration file
var config = JSON.parse(fs.readFileSync("config.json"));

// When the PR is opened or edited by an approved user, run the build and test
webhooks.on("pull_request", ({ id, name, payload }) => {
  handlePullRequest(payload);
});

// When a PR is approved by an approved user, run the build and test
webhooks.on("pull_request_review", ({ id, name, payload }) => {
  handlePullRequestReview(payload);
});

webhooks.on("push", ({ id, name, payload }) => {
  handlePush(payload);
});

function runAndReportStatus(prNum, sha) {
  let timestamp = new Date().toISOString();
  var logfile = `${prNum}-precheck-${timestamp}.log`;
  var logStream = fs.createWriteStream(`./logs/${logfile}`);

  sendStatus(prNum, sha, "precheck", "pending", logfile);

  console.log(`Pre-check PR #${prNum}`);
  var precheck = spawn("docker", [
    "build",
    "-t",
    `${config.owner}/${config.repo}:${prNum}`,
    "--build-arg",
    `pr_num=${prNum}`,
    "--build-arg",
    `sha=${sha}`,
    "--target=v8-riscv",
    ".",
  ]);
  precheck.stdout.pipe(logStream);
  precheck.stderr.pipe(logStream);
  precheck.on("close", function (code) {
    if (code != 0) {
      sendStatus(prNum, sha, "precheck", "failure", logfile);
    } else {
      sendStatus(prNum, sha, "precheck", "success", logfile);

      console.log(`Build PR #${prNum}`);
      logfile = `${prNum}-build-${timestamp}.log`;
      logStream = fs.createWriteStream(`./logs/${logfile}`);
      sendStatus(prNum, sha, "build", "pending", logfile);

      var build = spawn("docker", [
        "build",
        "-t",
        `${config.owner}/${config.repo}:${prNum}`,
        "--build-arg",
        `pr_num=${prNum}`,
        "--build-arg",
        `sha=${sha}`,
        "--target=v8-build",
        ".",
      ]);
      build.stdout.pipe(logStream);
      build.stderr.pipe(logStream);
      build.on("close", function (code) {
        if (code != 0) {
          sendStatus(prNum, sha, "build", "failure", logfile);
        } else {
          sendStatus(prNum, sha, "build", "success", logfile);

          console.log(`Run PR #${prNum}`);
          logfile = `${prNum}-run-${timestamp}.log`;
          logStream = fs.createWriteStream(`./logs/${logfile}`);
          sendStatus(prNum, sha, "run", "pending", logfile);

          var run = spawn("docker", [
            "build",
            "-t",
            `${config.owner}/${config.repo}:${prNum}`,
            "--build-arg",
            `pr_num=${prNum}`,
            "--build-arg",
            `sha=${sha}`,
            ".",
          ]);
          run.stdout.pipe(logStream);
          run.stderr.pipe(logStream);
          run.on("close", function (code) {
            if (code != 0) {
              sendStatus(prNum, sha, "run", "failure", logfile);
            } else {
              sendStatus(prNum, sha, "run", "success", logfile);

              // On success, delete the docker containers/images
              cleanupDocker(`${config.owner}/${config.repo}:${prNum}`);
            }
          });
        }
      });
    }
  });
}

async function buildAndRelease(sha) {
  let timestamp = new Date().toISOString();
  var logfile = `${timestamp}-${sha}-release.log`;
  var logStream = fs.createWriteStream(`./logs/${logfile}`);

  console.log("Generate release");
  var build = spawn("docker", [
    "build",
    "-f",
    "Dockerfile.release",
    "-t",
    `${config.owner}/${config.repo}:RELEASE`,
    ".",
  ]);
  build.stdout.pipe(logStream);
  build.stderr.pipe(logStream);
  build.on("close", async function (code) {
    if (code != 0) {
      console.log("  Release failed. Review logs.");
    } else {
      console.log("  Release build successful!");
      execSync("bash release.sh");
      console.log("  Created RPM");

      // Delete the LATEST release (if it exists)
      try {
        let latest = await octokit.repos.getReleaseByTag({
          owner: config.owner,
          repo: config.repo,
          tag: "LATEST",
        });
        await octokit.repos.deleteRelease({
          owner: config.owner,
          repo: config.repo,
          release_id: latest.data.id,
        });
        console.log("  Deleted old release");
      } catch(err) {
        console.log("  Error deleting old release:", err);
      }

      // Create the new release
      var release;
      try {
        release = await octokit.repos.createRelease({
          owner: config.owner,
          repo: config.repo,
          tag_name: "LATEST",
          name: "LATEST",
          target_commitish: sha,
        });
      } catch (err) {
        console.log("  Error releasing build:", err);
        return;
      }
      console.log("  Created release");

      // Upload the RPM to the release
      let filename = fs.readFileSync("rpm-file.txt", "utf8");
      let name = path.basename(filename);
      try {
        let response = await octokit.repos.uploadReleaseAsset({
          owner: config.owner,
          repo: config.repo,
          release_id: release.data.id,
          name: name,
          data: fs.readFileSync(filename),
          url: release.data.upload_url,
          headers: {
            "content-type": "application/tar+gzip",
          },
        });
      } catch (err) {
        console.log("  Error uploading asset:", err);
      }
      console.log("  Uploaded asset");
    }
  });
}

async function isMember(org, user) {
  try {
    await octokit.orgs.checkMembershipForUser({ org: org, username: user });
  } catch {
    return false;
  }
  return true;
}

async function sendStatus(prNum, sha, context, state, logfile) {
  console.log(`Send ${state} for ${context} to PR #${prNum}`);
  octokit.repos.createCommitStatus({
    owner: config.owner,
    repo: config.repo,
    sha: sha,
    state: state,
    target_url: `${process.env.BASE_URL}/logs/${logfile}`,
    context: context,
  });
}

async function handlePullRequest(payload) {
  let member = await isMember(config.owner, payload.pull_request.user.login);
  if (
    payload.repository.full_name != `${config.owner}/${config.repo}` ||
    !(
      payload.action == "opened" ||
      payload.action == "edited" ||
      payload.action == "synchronize" ||
      payload.action == "closed"
    ) ||
    !member
  ) {
    console.log(
      `Ignoring PR #${payload.number} ${payload.action} by ${payload.pull_request.user.login}`
    );
    return;
  }

  if (payload.action == "closed") {
    cleanupDocker(`${payload.repository.full_name}:${payload.number}`);
    return;
  }

  console.log(`Testing ${payload.repository.full_name} PR #${payload.number}`);
  runAndReportStatus(payload.number, payload.pull_request.head.sha);
}

async function handlePullRequestReview(payload) {
  let reviewerIsMember = await isMember(
    config.owner,
    payload.review.user.login
  );
  let ownerIsMember = await isMember(
    config.owner,
    payload.pull_request.user.login
  );

  if (
    payload.repository.full_name != `${config.owner}/${config.repo}` ||
    payload.review.state != "approved" ||
    // If the reviewer is not approved
    !reviewerIsMember ||
    // If the PR user is approved (already tested)
    ownerIsMember
  ) {
    console.log(
      `Ignoring ${payload.repository.full_name} PR #${payload.pull_request.number}: ${payload.review.user.login} ${payload.review.state}`
    );
    return;
  }

  console.log(
    `Testing ${payload.repository.full_name} PR #${payload.pull_request.number}`
  );
  runAndReportStatus(
    payload.pull_request.number,
    payload.pull_request.head.sha
  );
}

async function handlePush(payload) {
  if (
    payload.repository.full_name != `${config.owner}/${config.repo}` ||
    payload.ref != "refs/heads/riscv64"
  ) {
    console.log(
      `Ignoring push to ${payload.repository.full_name}:${payload.ref}`
    );
    return;
  }

  console.log(
    `Releasing ${payload.repository.full_name} SHA #${payload.after}`
  );
  buildAndRelease(payload.after);
}

function cleanupDocker(tag) {
  try {
    execSync(`docker rm $(docker ps -a -q --filter ancestor=${tag})`);
    execSync(`docker rmi ${tag}`);
  } catch {}
}

app.use("/hooks", webhooks.middleware);
app.use("/logs", express.static("logs"));
const server = app.listen(8000);
