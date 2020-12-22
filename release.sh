#!/usr/bin/bash

rm -rf release
mkdir -p release/usr/local/bin
docker container rm release
docker create -ti --name release v8-riscv/v8:RELEASE bash
docker cp release:/v8/out/riscv64.release/d8 release/usr/local/bin/
docker cp release:/v8/out/riscv64.release/snapshot_blob.bin release/usr/local/bin/

version=$(release/usr/local/bin/d8 < /dev/null | grep version | awk '{ print $3 }')
datestring=$(date +"%a %b %d %Y")
sed -i -e "s/@VERSION@/$version/g" -e "s/@DATE@/$datestring/g" -e "s/@SHA@/$0/g" d8.spec
tar czf ~/rpmbuild/SOURCES/d8-$version.tar.gz release/
rpmbuild -bb d8.spec &> /dev/null
printf "/home/v8-ci/rpmbuild/RPMS/x86_64/d8-$version-1.x86_64.rpm" > rpm-file.txt