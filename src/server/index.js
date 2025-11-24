// Shim file to support deployments where the Root Directory is set to `src`.
// This file simply requires the real server file located at the repository root
// (../.. is used to reach /opt/render/project/server/index.js when running
// from /opt/render/project/src/server/index.js).

try {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  require('../../server/index.js');
} catch (err) {
  // If something goes wrong during startup, print the error and exit
  // so the host logs show the failure.
  // eslint-disable-next-line no-console
  console.error('Failed to start backend shim:', err);
  process.exit(1);
}
