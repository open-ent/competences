#!/bin/bash

MVN_OPTS="-Duser.home=/var/maven"

if [ ! -e node_modules ]
then
  mkdir node_modules
fi

case $(uname -s) in
MINGW*)
  USER_UID=1000
  GROUP_UID=1000
  ;;
*)
  if [ -z ${USER_UID:+x} ]; then
		
    USER_UID=$(id -u)
    GROUP_GID=$(id -g)
  fi
  ;;
esac

# Interface React (frontend/, Vite) : construite sur l'hôte puis rangée dans les ressources du module, pour que
# `./build.sh install` produise à lui seul le jar complet (AngularJS + React) — aucune copie à la main.
# Ancien bundle supprimé d'abord et échec franc : jamais un vieux bundle embarqué en silence.
# Prérequis : Node >= 18 (corepack) et NODE_AUTH_TOKEN (paquets @open-ent privés).
buildReact () {
  local fe dir
  for fe in frontend; do
    [ -f "$fe/package.json" ] || continue
    dir=$(dirname "$fe")
    echo "[buildReact] Construction de l'interface React ($fe)"
    (
      cd "$fe" || exit 1
      rm -rf dist
      corepack pnpm install --frozen-lockfile || exit 1
      corepack pnpm build || exit 1
      ls dist/public/*.js >/dev/null 2>&1 || { echo "[buildReact] aucun bundle dans dist/public : build React invalide"; exit 1; }
    ) || { echo "[buildReact] ÉCHEC ($fe)"; exit 1; }
    mkdir -p "$dir/src/main/resources/public"
    cp -r "$fe/dist/public/." "$dir/src/main/resources/public/"
  done
}

clean () {
  docker-compose run --rm maven mvn $MVN_OPTS clean
}

buildNode () {
  case `uname -s` in
    MINGW*)
      docker-compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "yarn install --production=false --no-bin-links && node_modules/gulp/bin/gulp.js build && yarn run build:sass"
      ;;
    *)
      docker-compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "yarn install --production=false && node_modules/gulp/bin/gulp.js build && yarn run build:sass"
  esac
}

install() {
  buildReact
    docker compose run --rm maven mvn $MVN_OPTS clean install -U -DskipTests
}

buildGulp() {
    docker-compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "yarn install --no-bin-links && node_modules/gulp/bin/gulp.js build"
}

buildCss() {
    docker-compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "yarn run build:sass"
}

publish() {
    version=`docker-compose run --rm maven mvn $MVN_OPTS help:evaluate -Dexpression=project.version -q -DforceStdout`
    level=`echo $version | cut -d'-' -f3`

    case "$level" in
        *SNAPSHOT)
            export nexusRepository='snapshots'
            ;;
        *)
            export nexusRepository='releases'
            ;;
    esac

    docker-compose run --rm maven mvn $MVN_OPTS -DrepositoryId=ode-$nexusRepository -DskiptTests -Dmaven.test.skip=true --settings /var/maven/.m2/settings.xml deploy
}

testNode () {
  rm -rf coverage
  rm -rf */build
  case `uname -s` in
    MINGW*)
      docker-compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "yarn install --no-bin-links && node_modules/gulp/bin/gulp.js drop-cache &&  yarn test"
      ;;
    *)
      docker-compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "yarn install && node_modules/gulp/bin/gulp.js drop-cache && yarn test"
  esac
}

testNodeDev () {
  rm -rf coverage
  rm -rf */build
  case `uname -s` in
    MINGW*)
      docker-compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "yarn install --no-bin-links && node_modules/gulp/bin/gulp.js drop-cache && yarn run test:dev"
      ;;
    *)
      docker-compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "yarn install && node_modules/gulp/bin/gulp.js drop-cache && yarn run test:dev"
  esac
}

test() {
    docker-compose run --rm maven mvn $MVN_OPTS test
}

publishNexus() {
  version=`docker compose run --rm maven mvn $MVN_OPTS help:evaluate -Dexpression=project.version -q -DforceStdout`
  level=`echo $version | cut -d'-' -f3`
  case "$level" in
    *SNAPSHOT) export nexusRepository='snapshots' ;;
    *)         export nexusRepository='releases' ;;
  esac
  docker compose run --rm  maven mvn -DrepositoryId=ode-$nexusRepository -Durl=$repo -DskipTests -Dmaven.test.skip=true --settings /var/maven/.m2/settings.xml deploy
}

init() {
    me=`id -u`:`id -g`
    echo "DEFAULT_DOCKER_USER=$me" > .env
}

for param in "$@"
do
  case $param in
    init)
      init
      ;;
    clean)
      clean
      ;;
    buildNode)
      buildNode
      ;;
    buildMaven)
      install
      ;;
    install)
      buildNode && install
      ;;
    buildGulp)
      buildGulp
      ;;
    buildCss)
      buildCss
      ;;
    publish)
      publish
      ;;
    publishNexus)
      publishNexus
      ;;
    test)
      testNode ; test
      ;;
    testNode)
      testNode
      ;;
    testNodeDev)
      testNodeDev
    ;;
    testMaven)
      test
      ;;
    *)
      echo "Invalid argument : $param"
  esac
  if [ ! $? -eq 0 ]; then
    exit 1
  fi
done

