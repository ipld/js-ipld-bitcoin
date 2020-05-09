const dblSha2256 = require('./dbl-sha2-256')
const block = require('./bitcoin-block')
const tx = require('./bitcoin-tx')
const witnessCommitment = require('./bitcoin-witness-commitment')

module.exports = [
  dblSha2256,
  block,
  tx,
  witnessCommitment
]
