/* eslint-env mocha */
'use strict'

const { expect } = require('aegir/utils/chai')
const multicodec = require('multicodec')

const mod = require('../src')

describe('IPLD Format', () => {
  it('codec is bitcoin-block', () => {
    expect(mod.codec).to.equal(multicodec.BITCOIN_BLOCK)
  })

  it('defaultHashAlg is dbl-sha2-256', () => {
    expect(mod.defaultHashAlg).to.equal(multicodec.DBL_SHA2_256)
  })
})
