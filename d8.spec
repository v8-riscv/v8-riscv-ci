Name: d8
Version: @VERSION@
Release: 1
Summary: V8 RISC-V Terminal
License: MIT
URL: https://github.com/v8-riscv/v8
Packager: wuwei2016@iscas.ac.cn

Source: %{name}-%{version}.tar.gz

%define debug_package %{nil}

%description
V8 RISC-V Terminal

%prep
%setup -q -c -n %{name}-%{version}

%build

%install
cp -rfa * %{buildroot}

%files
%attr(0755,root,root) /usr/local/bin/d8
%attr(0644,root,root) /usr/local/bin/snapshot_blob.bin

%changelog
* @DATE@ v8-riscv - @VERSION@-1
- commit @SHA@
