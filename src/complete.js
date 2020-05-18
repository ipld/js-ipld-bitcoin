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

/*
if (require.main === module) {
  async function run () {
    const block = JSON.parse(require('fs').readFileSync(process.argv[2]))

    const base32 = require('multiformats/bases/base32')
    const multiformats = require('multiformats')()
    multiformats.multibase.add(base32)
    multiformats.add(require('./bitcoin'))
    for await (const { cid, binary } of encodeAll(multiformats, block)) {
      const { name } = multiformats.get(cid.code)
      console.log(cid.toString(), name, binary.length)
    }
  }

  run().catch((e) => {
    console.log(e.stack)
    process.exit(1)
  })
}
*/
