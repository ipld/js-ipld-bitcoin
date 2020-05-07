const { Buffer } = require('buffer')
const dblSha2256 = require('./dbl-sha2-256')
const block = require('./bitcoin-block')
const tx = require('./bitcoin-tx')

function init (multiformats) {
  if (typeof multiformats !== 'object') {
    throw new TypeError('Initialize with a multiformats object')
  }

  return [
    dblSha2256,
    block(multiformats),
    tx
  ]
}

module.exports = init
