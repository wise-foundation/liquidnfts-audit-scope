# Main Audit Scope - Included

1. PoolBase.sol (declarations for the pool and basic functions);
2. PoolHelper.sol (contains main helper functions);
3. PoolFactory.sol (simple factory producing pools as clones)
4. LiquidPool.sol (main pool high level logic);
5. LiquidRouter.sol (main router, to call pools and store hashes);

# Additional Scope (events / interfaces / views) - Included

1. Babylonian.sol (can be skipped, library used in several other projects);
2. IChainLink.sol (simple interface file for chainlink interactions, does not contain logic);
3. ILiquidInit.sol (simple interface file for the initial pool call, does not contain logic);
4. ILiquidPool.sol (simple interface file for main functions of the pool, does not contain logic);
5. ILiquidRouter.sol (simple interface file for the router, does not contain logic);
6. LiquidEvents.sol (simple events for the the pool, does not contain logic);
7. RouterEvents.sol (simple events for the the router, does not contain logic);
8. AccessControl.sol (simple role manager);
9. PoolShareToken.sol (reviewed before as part of other audit, exact same copy)
10. PoolViews.sol (only contains external views does not affect the state)
11. LiquidTransfer.sol (simple helper to move NFT tokens) 

# !SKIP! - not to be included in the audit - Not Included 
skip them (these files are purely for testing and test scenarios, not part of the actual product or scope of the audit)

1. NFT721.sol (represents regular NFT);
2. TestToken.sol (represents regular ERC20);
3. TesterPool.sol (mock wrapper for testing pools);
4. TesterChainlink.sol (for testing chainlink);
5. TestHeartBeatStandAlone.sol (for testing chainlink);
