const dblSha2256 = require('./dbl-sha2-256')
const block = require('./bitcoin-block')
const tx = require('./bitcoin-tx')
const witnessCommitment = require('./bitcoin-witness-commitment')
const { BitcoinBlock } = require('bitcoin-block')
const { encodeAll, assemble } = require('./complete')

function deserializeFullBitcoinBinary (binary) {
  return BitcoinBlock.decode(binary).toPorcelain()
}

function serializeFullBitcoinBinary (obj) {
  return BitcoinBlock.fromPorcelain(obj).encode()
}

async function blockToCar (multiformats, carWriter, obj) {
  let root = false
  for await (const { cid, binary } of encodeAll(multiformats, obj)) {
    if (!root) {
      root = true
      await carWriter.setRoots(cid)
    }
    await carWriter.put(cid, binary)
  }

  await carWriter.close()
}

module.exports = [
  dblSha2256,
  block,
  tx,
  witnessCommitment
]
module.exports.deserializeFullBitcoinBinary = deserializeFullBitcoinBinary
module.exports.serializeFullBitcoinBinary = serializeFullBitcoinBinary
module.exports.blockToCar = blockToCar
module.exports.assemble = assemble
