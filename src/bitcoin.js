const dblSha2256 = require('./dbl-sha2-256')
const block = require('./bitcoin-block')
const tx = require('./bitcoin-tx')
const witnessCommitment = require('./bitcoin-witness-commitment')
const { BitcoinBlock, toHashHex } = require('bitcoin-block')
const { encodeAll, assemble } = require('./complete')

function deserializeFullBitcoinBinary (binary) {
  return BitcoinBlock.decode(binary).toPorcelain()
}

function serializeFullBitcoinBinary (obj) {
  return BitcoinBlock.fromPorcelain(obj).encode()
}

async function blockToCar (multiformats, carWriter, obj) {
  let root
  for await (const { cid, binary } of encodeAll(multiformats, obj)) {
    if (!root) {
      root = cid
      await carWriter.setRoots(cid)
    }
    await carWriter.put(cid, binary)
  }

  await carWriter.close()
  return root
}

function cidToHash (multiformats, cid) {
  if (!multiformats.CID.isCID(cid)) {
    cid = new multiformats.CID(cid)
  }
  const { digest } = multiformats.multihash.decode(cid.multihash)
  return toHashHex(digest)
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
module.exports.blockHashToCID = block.blockHashToCID
module.exports.cidToHash = cidToHash
module.exports.txHashToCID = tx.txHashToCID
