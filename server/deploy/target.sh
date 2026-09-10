# Sourced by every script that takes root@IP as its first argument, right after
# it has read $TARGET.
#
# «root@SERVER_IP» and «root@IP» are how these lines are written in README.md,
# in CLAUDE.md and in docs/versiyalar.md, and they get pasted in unchanged.
# What ssh then says — «could not resolve hostname server_ip» — is true and
# unhelpful, and push.sh had already built the pages and started sending a tar
# by the time it appeared. Only `case` here: this file is sourced under `set -e`,
# where a failing `[ … ] && …` as the last command would abort the caller.
case "$TARGET" in
  *@IP|*@SERVER_IP|*@server_ip|*@SERVER-IP|*@VPS_IP|*@vps_ip|*@your-server*|IP|SERVER_IP)
    echo "«$TARGET» — bu ko'rsatmadagi o'rnini bosuvchi nom, haqiqiy manzil emas."
    echo "Serveringizning IP manzilini yozing, masalan: root@203.0.113.17"
    exit 1 ;;
esac
