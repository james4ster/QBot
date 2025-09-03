{ pkgs }: {
  deps = [
    pkgs.nodejs
    pkgs.cairo
    pkgs.pango
    pkgs.libjpeg
    pkgs.giflib
    pkgs.libuuid
    pkgs.inetutils  # ping, traceroute, etc.
  ];
}
