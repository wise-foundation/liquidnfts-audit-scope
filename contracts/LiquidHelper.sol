// SPDX-License-Identifier: WISE

pragma solidity =0.8.12;

import "./LiquidBase.sol";

contract LiquidHelper is LiquidBase {

    /**
     * @dev encoding for transfer
     */
    bytes4 constant TRANSFER = bytes4(
        keccak256(
            bytes(
                "transfer(address,uint256)"
            )
        )
    );

    /**
     * @dev encoding for transferFrom
     */
    bytes4 constant TRANSFER_FROM = bytes4(
        keccak256(
            bytes(
                "transferFrom(address,address,uint256)"
            )
        )
    );

    /**
     * @dev returns IDs of NFTs being held
     */
    function getTokens()
        public
        view
        returns (uint256[] memory)
    {
        return globals.tokenId;
    }

    /**
     * @dev returns true if contributions have not reached min asked
     */
    function floorNotReached()
        public
        view
        returns (bool)
    {
        return contributionPhase() == false && belowFloorAsked() == true;
    }

    /**
     * @dev returns true if the provider address is not the single provider
     */
    function notSingleProvider(
        address _checkAddress
    )
        public
        view
        returns (bool)
    {
        address provider = singleProvider;
        return
            provider != _checkAddress &&
            provider != ZERO_ADDRESS;
    }

    /**
     * @dev returns true if the contributor will reach the ceiling asked with the provided token amount
     */
    function reachedTotal(
        address _contributor,
        uint256 _tokenAmount
    )
        public
        view
        returns (bool)
    {
        return contributions[_contributor] + _tokenAmount >= totalAsked;
    }

    /**
     * @dev returns true if locker has not been enabled within 7 days after contribution phase
     */
    function missedActivate()
        public
        view
        returns (bool)
    {
        return
            floorNotReached() &&
            startingTimestamp() + DEADLINE_TIME < block.timestamp;
    }

    /**
     * @dev returns true if owner has not paid back within 7 days of last payment
     */
    function missedDeadline()
        public
        view
        returns (bool)
    {
        uint256 nextDueOrDeadline = nextDueTime > paybackTimestamp()
            ? paybackTimestamp()
            : nextDueTime;

        return
            nextDueTime > 0 &&
            nextDueOrDeadline + DEADLINE_TIME < block.timestamp;
    }

    /**
     * @dev returns true total collected is below the min asked
     */
    function belowFloorAsked()
        public
        view
        returns (bool)
    {
        return totalCollected < floorAsked;
    }

    /**
     * @dev returns true if nextDueTime is 0, mean it has not been initialized (unix timestamp)
     */
    function paymentTimeNotSet()
        public
        view
        returns (bool)
    {
        return nextDueTime == 0;
    }

    /**
     * @dev returns true if contract is in contribution phase time window
     */
    function contributionPhase()
        public
        view
        returns (bool)
    {
        return timeSince(creationTime) < CONTRIBUTION_TIME;
    }

    /**
     * @dev returns final due time of loan
     */
    function paybackTimestamp()
        public
        view
        returns (uint256)
    {
        return startingTimestamp() + globals.paymentTime;
    }

    /**
     * @dev returns approximate time the loan will/did start
     */
    function startingTimestamp()
        public
        view
        returns (uint256)
    {
        return creationTime + CONTRIBUTION_TIME;
    }

    /**
     * @dev returns address to transfer NFT to in event of liquidation
     */
    function liquidateTo()
        public
        view
        returns (address)
    {
        return singleProvider == ZERO_ADDRESS
            ? TRUSTEE_MULTISIG
            : singleProvider;
    }

    /**
     * @dev returns bool if owner was removed
     */
    function ownerlessLocker()
        public
        view
        returns (bool)
    {
        return globals.lockerOwner == ZERO_ADDRESS;
    }

    /**
     * @dev returns calc of time since a certain timestamp to block timestamp
     */
    function timeSince(
        uint256 _timeStamp
    )
        public
        view
        returns (uint256)
    {
        return block.timestamp - _timeStamp;
    }

    /**
     * @dev sets due time to 0
     */
    function _revokeDueTime()
        internal
    {
        nextDueTime = 0;
    }

    /**
     * @dev adds a contribution on to the currently stored amount of contributions for a user
     */
    function _increaseContributions(
        address _contributorsAddress,
        uint256 _contributionAmount
    )
        internal
    {
        contributions[_contributorsAddress] =
        contributions[_contributorsAddress] + _contributionAmount;
    }

    /**
     * @dev adds an amount to totalCollected
     */
    function _increaseTotalCollected(
        uint256 _increaseAmount
    )
        internal
    {
        totalCollected =
        totalCollected + _increaseAmount;
    }

    /**
     * @dev subs an amount to totalCollected
     */
    function _decreaseTotalCollected(
        uint256 _decreaseAmount
    )
        internal
    {
        totalCollected =
        totalCollected - _decreaseAmount;
    }

    /**
     * @dev Helper function to add payment tokens and penalty tokens to their internal variables
     * Also calculates remainingBalance due for the owner.
     */
    function _adjustBalances(
        uint256 _paymentTokens,
        uint256 _penaltyTokens
    )
        internal
    {
        claimableBalance = claimableBalance
            + _paymentTokens;

        uint256 newBalance = remainingBalance
            + _penaltyTokens;

        remainingBalance = _paymentTokens < newBalance
            ? newBalance - _paymentTokens : 0;
    }

    /**
     * @dev does an erc20 transfer then check for success
     */
    function _safeTransfer(
        address _token,
        address _to,
        uint256 _value
    )
        internal
    {
        (bool success, bytes memory data) = _token.call(
            abi.encodeWithSelector(
                TRANSFER,
                _to,
                _value
            )
        );

        require(
            success && (
                data.length == 0 || abi.decode(
                    data, (bool)
                )
            ),
            "LiquidHelper: TRANSFER_FAILED"
        );
    }

    /**
     * @dev does an erc20 transferFrom then check for success
     */
    function _safeTransferFrom(
        address _token,
        address _from,
        address _to,
        uint256 _value
    )
        internal
    {
        (bool success, bytes memory data) = _token.call(
            abi.encodeWithSelector(
                TRANSFER_FROM,
                _from,
                _to,
                _value
            )
        );

        require(
            success && (
                data.length == 0 || abi.decode(
                    data, (bool)
                )
            ),
            "LiquidHelper: TRANSFER_FROM_FAILED"
        );
    }
}
