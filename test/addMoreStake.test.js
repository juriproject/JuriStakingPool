// TODO

/* describe('when adding more stake', async () => {
  it('adds stake to next period', async () => {
    const initialUserStake = new BN(5000)
    const addedUserStake = new BN(8000)

    await initialPoolSetup({
      pool: juriStakingPool,
      poolUsers: [user1],
      poolStakes: [initialUserStake],
      token,
    })

    await token.approve(juriStakingPool.address, addedUserStake, {
      from: user1,
    })
    await juriStakingPool.addMoreStakeForNextPeriod(addedUserStake, {
      from: user1,
    })

    const stakeAtCurrentPeriod = await juriStakingPool.getStakeForUserInCurrentPeriod(
      user1
    )
    const stakeAtNextPeriod = await juriStakingPool.getAdditionalStakeForUserInNextPeriod(
      user1
    )

    expect(stakeAtCurrentPeriod).to.be.bignumber.equal(initialUserStake)
    expect(stakeAtNextPeriod).to.be.bignumber.equal(addedUserStake)
  })

  describe('when adding more than the maximum stake per user', async () => {
    it('fails with an error describing max per user is reached', async () => {
      await initialPoolSetup({
        pool: juriStakingPool,
        poolUsers: [user1],
        poolStakes: [5000],
        token,
      })

      await token.approve(juriStakingPool.address, ONE_HUNDRED_TOKEN, {
        from: user1,
      })

      await shouldFail.reverting.withMessage(
        juriStakingPool.addMoreStakeForNextPeriod(ONE_HUNDRED_TOKEN, {
          from: user1,
        }),
        'Cannot add more funds for user, because the max per user is reached!'
      )
    })
  })

  describe('when adding above the maximum total stake in pool', async () => {
    it('fails with an error describing max in pool is reached', async () => {
      await initialPoolSetup({
        pool: juriStakingPool,
        poolUsers: [user1],
        poolStakes: [5000],
        token,
      })

      await token.approve(juriStakingPool.address, ONE_HUNDRED_TOKEN, {
        from: user2,
      })
      await juriStakingPool.addMoreStakeForNextPeriod(ONE_HUNDRED_TOKEN, {
        from: user2,
      })

      await token.approve(juriStakingPool.address, ONE_HUNDRED_TOKEN, {
        from: user3,
      })

      await shouldFail.reverting.withMessage(
        juriStakingPool.addMoreStakeForNextPeriod(ONE_HUNDRED_TOKEN, {
          from: user3,
        }),
        'Cannot add more funds to pool, because the max in pool is reached!'
      )
    })
  })
}) */
