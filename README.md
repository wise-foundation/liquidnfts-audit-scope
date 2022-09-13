# Audit Scope

1. AccessControl.sol (simple role manager);

## optional (events / interfaces)

2. Babylonian.sol (can be skipped, library used in several other projects);
3. IChainLink.sol (simple interface file for chainlink interactions, does not contain logic);
4. ILiquidInit.sol (simple interface file for the initial pool call, does not contain logic);
5. ILiquidPool.sol (simple interface file for main functions of the pool, does not contain logic);
6. ILiquidRouter.sol (simple interface file for the router, does not contain logic);
7. LiquidEvents.sol (simple events for the the pool, does not contain logic);
8. RouterEvents.sol (simple events for the the router, does not contain logic);

## core (main scope)

1. LiquidPool.sol (main pool high level logic);
2. LiquidRouter.sol (main router, to call pools and store hashes);
3. PoolFactory.sol (main factory, simple contract producing new pools);

## helper (main scope)

4. LiquidTransfer.sol (for NFT transfer only);
5. PoolBase.sol (declarations for the pool and basic functions);
6. PoolHelper.sol (contains main helper functions);
7. PoolShareToken.sol (generic ERC20, was reviewed before exact copy, represents share);
8. PoolViews.sol (contains only external views, does not affect state of the contract!);


# !SKIP! - not to be included in the audit
skip them (these files are purely for testing and test scenarios, not part of the actual product or scope of the audit)

1. NFT721.sol (represents regular NFT);
2. TestToken.sol (represents regular ERC20);
3. TesterPool.sol (mock wrapper for testing pools);
4. TesterChainlink.sol (for testing chainlink);
5. TestHeartBeatStandAlone.sol (for testing chainlink);
