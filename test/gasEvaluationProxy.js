const stats = require('stats-lite')

const gasResults = new Map()

const createProxyContract = contract => {
  const handler = {
    get: (target, prop) => {
      if (typeof target[prop] !== 'function') return target[prop]

      return async (...args) => {
        const result = await target[prop].apply(this, args)

        if (result.receipt) {
          gasResults.set(
            prop,
            gasResults.get(prop)
              ? [...gasResults.get(prop), result.receipt.gasUsed]
              : [result.receipt.gasUsed]
          )
        }

        return result
      }
    },
  }

  return new Proxy(contract, handler)
}

const getGasResults = () => {
  const results = {}

  for (const [key, value] of gasResults) {
    results[key] = {
      mean: Math.round(stats.mean(value)),
      median: stats.median(value),
      min: Math.min(...value),
      max: Math.max(...value),
    }
  }

  return results
}

module.exports = { createProxyContract, getGasResults }
