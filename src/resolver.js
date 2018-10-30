'use strict'

const util = require('./util')

/**
 * @typedef ResolveObject
 * @property {*} value - Value the path resolves to
 * @property {string} remainderPath - If the path resolves half-way to a
 *   link, then the `remainderPath` is the part after the link that can be used
 *   for further resolving.
 */
/**
 * Resolves a path in a Bitcoin block.
 *
 * Returns the value or a link and the partial mising path. This way the
 * IPLD Resolver can fetch the link and continue to resolve.
 *
 * @param {Buffer} binaryBlob - Binary representation of a Bitcoin block
 * @param {string} [path='/'] - Path that should be resolved
 * @returns {Promise<ResolveObject>}
 */
const resolve = async (binaryBlob, path) => {
  const dagNode = await util.deserialize(binaryBlob)

  // Return the deserialized block if no path is given
  if (!path) {
    return {
      value: dagNode,
      remainderPath: ''
    }
  }

  const pathArray = path.split('/')
  const value = resolveField(dagNode, pathArray[0])
  if (value === null) {
    throw new Error('No such path')
  }

  let remainderPath = pathArray.slice(1).join('/')
  // It is a link, hence it may have a remainder
  if (value['/'] !== undefined) {
    return {
      value: value,
      remainderPath: remainderPath
    }
  } else {
    if (remainderPath.length > 0) {
      throw new Error('No such path')
    }

    return {
      value: value,
      remainderPath: ''
    }
  }
}

/**
 * Return all available paths of a block.
 *
 * @param {Buffer} binaryBlob - Binary representation of a Bitcoin block
 * @param {Object} [options] - Possible options
 * @param {boolean} [options.values=false] - Retun only the paths by default.
 *   If it is `true` also return the values
 * @returns {Promise<string[] | Object.<string, *>[]>} - The result depends on
 *   `options.values`, whether it returns only the paths, or the paths with
 *   the corresponding values
 */
const tree = async (binaryBlob, options = {}) => {
  const dagNode = await util.deserialize(binaryBlob)
  const paths = ['version', 'timestamp', 'difficulty', 'nonce',
    'parent', 'tx']

  if (options.values === true) {
    const pathValues = {}
    for (let path of paths) {
      pathValues[path] = resolveField(dagNode, path)
    }
    return pathValues
  } else {
    return paths
  }
}

// Return top-level fields. Returns `null` if field doesn't exist
const resolveField = (dagNode, field) => {
  switch (field) {
    case 'version':
      return dagNode.version
    case 'timestamp':
      return dagNode.timestamp
    case 'difficulty':
      return dagNode.bits
    case 'nonce':
      return dagNode.nonce
    case 'parent':
      return {'/': util.hashToCid(dagNode.prevHash)}
    case 'tx':
      return {'/': util.hashToCid(dagNode.merkleRoot)}
    default:
      return null
  }
}

module.exports = {
  multicodec: 'bitcoin-block',
  defaultHashAlg: 'dbl-sha2-256',
  resolve: resolve,
  tree: tree
}
