#!/usr/bin/bash

target_branch=$1
source_branch=$2

commits=$(git rev-list ${target_branch}..${source_branch})
for commit in $commits; do
    message=$(git log --format=%B -n 1 $commit)
    lineNum=0
    while IFS=$'\n' read -r line; do
        # Next, check the requirements of the line
        if [[ $lineNum -eq 0 ]]; then
            if [[ ${#line} -gt 50 ]]; then
                echo "Commit message: Limit the subject line to 50 characters"
                echo "https://chris.beams.io/posts/git-commit/#limit-50"
                exit 1
            fi

            if [[ $line =~ ^[[:lower:]] ]]; then
                echo "Commit message: Capitalize the subject line"
                echo "https://chris.beams.io/posts/git-commit/#capitalize"
                exit 1
            fi

            if [[ $line =~ \.$ ]]; then
                echo "Commit message: Do not end the subject line with a period"
                echo "https://chris.beams.io/posts/git-commit/#end"
                exit 1
            fi
        elif [[ $lineNum -eq 1 ]]; then
            if [[ ${#line} -ne 0 ]]; then
                echo "Commit message: Separate subject from body with a blank line"
                echo "https://chris.beams.io/posts/git-commit/#separate"
                exit 1
            fi
        else
            if [[ ${#line} -gt 72 ]]; then
                echo "Commit message: Wrap the body at 72 characters"
                echo "https://chris.beams.io/posts/git-commit/#wrap-72"
                exit 1
            fi
        fi

        lineNum=$((lineNum + 1))
    done <<< "$message"
done