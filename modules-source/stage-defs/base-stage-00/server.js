const { server } = require('./src/server-core')

const PORT = process.env.PORT || 3307
// This app is deliberately vulnerable, so it only listens on this machine.
// Set HOST=0.0.0.0 only if you know you need it (for example inside a container).
const HOST = process.env.HOST || '127.0.0.1'
server.listen(PORT, HOST, () => {
  console.log(`NeonCart (stage scaffold) listening on http://localhost:${PORT}`)
})
