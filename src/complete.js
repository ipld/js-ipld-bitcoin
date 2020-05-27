const { BitcoinBlock, BitcoinTransaction } = require('bitcoin-block')
const {
  encodeAll: encodeAllTx,
  encodeAllNoWitness: encodeAllTxNoWitness
} = require('./bitcoin-tx')
const { encodeWitnessCommitment } = require('./bitcoin-witness-commitment')
const { HASH_ALG } = require('./constants')

async function mkblock (multiformats, obj, codec) {
  const { code } = multiformats.get(codec)
  const binary = await multiformats.encode(obj, code)
  const mh = await multiformats.multihash.hash(binary, HASH_ALG)
  return {
    cid: new multiformats.CID(1, code, mh),
    binary
  }
}

async function * encodeAll (multiformats, block) {
  if (typeof multiformats !== 'object' || typeof multiformats.multihash !== 'object' ||
      typeof multiformats.multihash.encode !== 'function' ||
      typeof multiformats.CID !== 'function') {
    throw new TypeError('multiformats argument must have multihash and CID capabilities')
  }

  const cidSet = new Set()
  const counts = {
    blocks: 1, // header
    tx: 0,
    witTx: 0,
    txMerkle: 0,
    witTxMerkle: 0,
    duplicates: 0
  }

  // header
  yield await mkblock(multiformats, block, 'bitcoin-block')
  counts.blocks++

  // transactions in segwit merkle
  for await (const { cid, binary } of encodeAllTxNoWitness(multiformats, block)) {
    if (cidSet.has(cid.toString())) {
      counts.duplicates++
      continue
    }
    cidSet.add(cid.toString())
    yield { cid, binary }
    counts.blocks++
    if (binary.length !== 64) {
      counts.tx++
    } else {
      counts.txMerkle++
    }
  }

  const segWit = BitcoinTransaction.isPorcelainSegWit(block.tx[0])
  if (!segWit) {
    // console.log(counts)
    return
  }

  let lastCid
  for await (const { cid, binary } of encodeAllTx(multiformats, block)) {
    lastCid = cid
    if (cidSet.has(cid.toString())) {
      counts.duplicates++
      continue
    }
    cidSet.add(cid.toString())
    yield { cid, binary }
    counts.blocks++
    if (binary.length !== 64) {
      counts.witTx++
    } else {
      counts.witTxMerkle++
    }
  }

  if (!lastCid) {
    if (block.tx.length === 1) {
      lastCid = null
    } else {
      throw new Error('Unexpected missing witnessMerkleRoot!')
    }
  }

  yield await encodeWitnessCommitment(multiformats, block, lastCid)
  // counts.blocks++
  // console.log(counts)
}

/**
 * Given a CID for a `bitcoin-block` Bitcoin block header and an IPLD block loader that can retrieve Bitcoin IPLD blocks by CID, re-assemble a full Bitcoin block graph into both object and binary forms.
 *
 * The loader should be able to return the binary form for `bitcoin-block`, `bitcoin-tx` and `bitcoin-witness-commitment` CIDs.
 *
 * Note that there are approximately 4,000 Bitcoin block graphs pre-SegWit which have the appearance of SegWit blocks but are, in fact, not. These blocks will cause the loader to be called for `bitcoin-witness-commitment` CIDs that will not resolve. Such resolution should throw an `Error` but this will not be propagated, but rather be used as a signal that the block is not a SegWit block and the assembler should not proceed to load it as such.
 *
 * @param {object} multiformats a multiformats object with the Bitcoin multicodec and multihash installed
 * @param {function} loader an IPLD block loader function that takes a CID argument and returns a `Buffer` or `Uint8Array` containing the binary block data for that CID
 * @param {CID} blockCID a CID of type `bitcoin-block` pointing to the Bitcoin block header for the block to be assembled
 * @returns {object} an object containing two properties, `deserialized` and `binary` where `deserialized` contains a full JavaScript instantiation of the Bitcoin block graph and `binary` contains a `Buffer` with the binary representation of the graph.
 * @function
 */
async function assemble (multiformats, loader, blockCid) {
  const merkleCache = {}
  async function loadTx (txCid) {
    const txCidStr = txCid.toString()
    if (merkleCache[txCidStr]) {
      return merkleCache[txCidStr]
    }
    const node = multiformats.decode(await loader(txCid), 'bitcoin-tx')
    merkleCache[txCidStr] = node
    return node
  }

  const block = multiformats.decode(await loader(blockCid), 'bitcoin-block')
  let merkleRootCid = block.tx

  const coinbase = await (async () => {
    // find the coinbase
    let txCid = merkleRootCid
    let node
    while (true) {
      node = await loadTx(txCid)
      if (Array.isArray(node)) { // merkle node
        txCid = node[0]
      } else { // transaction
        return node
      }
    }
  })()

  async function * transactions (txCid) {
    const node = await loadTx(txCid)
    if (Array.isArray(node)) {
      if (node[0] !== null) { // coinbase will be missing for witness merkle
        yield * transactions(node[0])
      }
      if (node[0] === null || !node[0].equals(node[1])) { // wonky btc merkle rules
        yield * transactions(node[1])
      }
    } else {
      yield node
    }
  }

  const txs = []

  if (coinbase.witnessCommitment) {
    try {
      const witnessCommitment = multiformats.decode(await loader(coinbase.witnessCommitment), 'bitcoin-witness-commitment')
      // if we got here, the witness commitment was real (see notes in catch()), so it's safe to proceed with the assumption
      // this is a proper segwit block

      // insert the nonce into the coinbase
      coinbase.vin[0].txinwitness = [witnessCommitment.nonce.toString('hex')]
      // nullify the hash so txid!==hash and BitcoinTransaction.fromPorcelain() will interpret it as a segwit
      coinbase.hash = ''.padStart(64, '0')

      if (witnessCommitment.witnessMerkleRoot !== null) {
        // push the coinbase in as tx 0 since the witness merkle doesn't contain the coinbase
        txs.push(coinbase)
        merkleRootCid = witnessCommitment.witnessMerkleRoot
      } // else this is a special case of a segwit block with _only  a coinbase
    } catch (err) {
      // we've _likely_ hit tha special case of a coinbase appearing to have a witness commitment but it's not really
      // a witness commitment, one of its vouts' scriptPubKey has the right length and leading 6 bytes so we can't
      // distinguish it from a real witness commitment, so we back up and act as if there's no witness commitment
    }
    // else there's no witness merkle, should be only a coinbase in this block and it's all in the
    // base tx merkle + the nonce from the witness commitment
  }

  for await (const tx of transactions(merkleRootCid)) {
    txs.push(tx)
  }

  block.tx = txs

  const bb = BitcoinBlock.fromPorcelain(block)
  return {
    deserialized: bb.toPorcelain(),
    binary: bb.encode()
  }
}

module.exports.encodeAll = encodeAll
module.exports.assemble = assemble
