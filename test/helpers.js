'use strict'

const { Buffer } = require('buffer')

const BITCOIN_BLOCK_HEADER_SIZE = require('../src/index')
  .util.BITCOIN_BLOCK_HEADER_SIZE

const headerFromHexBlock = (hex) => {
  return Buffer.from(hex.toString(), 'hex').slice(0, BITCOIN_BLOCK_HEADER_SIZE)
}

module.exports = {
  headerFromHexBlock
}
