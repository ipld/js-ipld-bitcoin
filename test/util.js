const { Buffer } = require('buffer')
const base32 = require('multiformats/bases/base32')
const bitcoin = require('../')
const { fromHashHex } = require('bitcoin-block')
const fixtures = require('./fixtures')

const CODEC_TX_CODE = 0xb1
const CODEC_WITNESS_COMMITMENT_CODE = 0xb2
// the begining of a dbl-sha2-256 multihash, prepend to hash or txid
const MULTIHASH_DBLSHA2256_LEAD = '5620'

function setupMultiformats (multiformats) {
  multiformats.multibase.add(base32)
  multiformats.add(bitcoin)
}

function txHashToCid (multiformats, hash) {
  return new multiformats.CID(1, CODEC_TX_CODE, Buffer.from(`${MULTIHASH_DBLSHA2256_LEAD}${hash}`, 'hex'))
}

function witnessCommitmentHashToCid (multiformats, hash) {
  return new multiformats.CID(1, CODEC_WITNESS_COMMITMENT_CODE, Buffer.from(`${MULTIHASH_DBLSHA2256_LEAD}${hash}`, 'hex'))
}

function cleanBlock (block) {
  block = Object.assign({}, block)
  // chain-context data that can't be derived
  'confirmations chainwork height mediantime nextblockhash'.split(' ').forEach((p) => delete block[p])
  return block
}

function blockDataToHeader (block) {
  const header = cleanBlock(block)
  // data that can't be derived without transactions
  'tx nTx size strippedsize weight'.split(' ').forEach((p) => delete header[p])
  return header
}

let blocks = null
async function setupBlocks (multiformats) {
  if (blocks) {
    return blocks
  }
  blocks = {}

  for (const name of fixtures.names) {
    blocks[name] = await fixtures(name)
    blocks[name].expectedHeader = blockDataToHeader(blocks[name].data)
    blocks[name].expectedHeader.parent = new multiformats.CID(blocks[name].meta.parentCid)
    blocks[name].expectedHeader.tx = new multiformats.CID(blocks[name].meta.txCid)
    if (blocks[name].data.tx[0].txid !== blocks[name].data.tx[0].hash) {
      // is segwit transaction, add default txinwitness, see
      // https://github.com/bitcoin/bitcoin/pull/18826 for why this is missing
      blocks[name].data.tx[0].vin[0].txinwitness = [''.padStart(64, '0')]
    }
    for (const tx of blocks[name].data.tx) {
      // manually ammend expected to include vin links (CIDs) to previous transactions
      for (const vin of tx.vin) {
        if (vin.txid) {
          // this value comes out of the json, so it's already a BE hash string, we need to reverse it
          vin.tx = txHashToCid(multiformats, fromHashHex(vin.txid).toString('hex'))
        }
      }
    }
  }

  return blocks
}

// manually find the witness commitment inside the coinbase.
// it's in _one of_ the vout's, one that's 38 bytes long and starts with a special prefix
// which we need to strip out to find a 32-byte hash
function findWitnessCommitment (block) {
  const coinbase = block.tx[0]
  for (const vout of coinbase.vout) {
    const spk = vout.scriptPubKey.hex
    if (spk.length === 38 * 2 && spk.startsWith('6a24aa21a9ed')) {
      return Buffer.from(spk.slice(12), 'hex')
    }
  }
}

function toHex (d) {
  return d.reduce((hex, byte) => hex + byte.toString(16).padStart(2, '0'), '')
}

module.exports = {
  setupMultiformats,
  txHashToCid,
  witnessCommitmentHashToCid,
  setupBlocks,
  findWitnessCommitment,
  fixtureNames: fixtures.names,
  cleanBlock,
  CODEC_TX_CODE,
  toHex
}
