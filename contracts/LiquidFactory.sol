// SPDX-License-Identifier: WISE

pragma solidity =0.8.12;

import "./LiquidTransfer.sol";

interface ILiquidLocker {

    function initialize(
        uint256[] calldata _tokenId,
        address _tokenAddress,
        address _tokenOwner,
        uint256 _floorAsked,
        uint256 _totalAsked,
        uint256 _paymentTime,
        uint256 _paymentRate
    )
        external;

    function makeContribution(
        uint256 _tokenAmount,
        address _tokenHolder
    )
        external
        returns (uint256, uint256);

    function donateFunds(
        uint256 _donationAmount
    )
        external;

    function payBackFunds(
        uint256 _paymentAmount,
        address _paymentAddress
    )
        external;

    function PAYMENT_TOKEN()
        external
        view
        returns (address);
}

/**
 * @dev LiquidFactory: Factory is responsible for deploying new LiquidLockers.
 * We use solidity assembly here to directly copy the bytes of a target contract into a new contract
 * Contributions to lockers and Paybacks to lockers go through this factory as a middle contract
 *
 */
contract LiquidFactory is LiquidTransfer {

    // Precision factor for interest rate
    uint256 public constant RATE_MAX = 100E18;

    // Team multisig address
    address public masterAddress;

    // Contract we use an implementation if there is not a specific locker implementation for a given erc20 token address
    address public defaultTarget;

    // This contract is used as a target for cloning new lockers. Each token has its own target implementation. These implementations can be updated.
    mapping(address => address) public implementations;

    // Zero address for value reference
    address constant ZERO_ADDRESS = address(0);

    bytes4 constant TRANSFER_FROM = bytes4(
        keccak256(
            bytes(
                "transferFrom(address,address,uint256)"
            )
        )
    );

    event NewLocker(
        address indexed lockerAddress,
        address indexed ownersAddress,
        address indexed tokensAddress
    );

    event ContributeToLocker(
        address indexed lockerAddress,
        address indexed backerAddress,
        uint256 contributionAmount,
        uint256 totalIncreaseAmount
    );

    event DonateToLocker(
        address indexed lockerAddress,
        address indexed payersAddress,
        uint256 donateAmount
    );

    event PaybackToLocker(
        address indexed lockerAddress,
        address indexed payersAddress,
        uint256 paybackAmount
    );

    event ImplementationChange(
        address indexed oldImplementation,
        address indexed newImplementation,
        address indexed tokenKeyAddress
    );

    modifier onlyMaster() {
        require(
            msg.sender == masterAddress,
            "LiquidFactory: INVALID_MASTER"
        );
        _;
    }

    /**
     * @dev Set parameters and precompute some locker addresses.
     */
    constructor(
        address _defaultToken,
        address _defaultTarget
    ) {
        defaultTarget = _defaultTarget;
        implementations[_defaultToken] = _defaultTarget;
        masterAddress = msg.sender;
    }

    /**
     * @dev Change the default target contract. Only master address can do this.
     */
    function updateDefaultTarget(
        address _newDefaultTarget
    )
        external
        onlyMaster
    {
        defaultTarget = _newDefaultTarget;
    }

    /**
     * @dev Add or modify the address used for cloning a locker based on a specific erc20 address.
     * This can be used to set an implementation for a new token when there is not yet one.
     * Only master can use this function.
     */
    function updateImplementation(
        address _tokenAddress,
        address _targetAddress
    )
        external
        onlyMaster
    {
        implementations[_tokenAddress] = _targetAddress;
    }

    /**
     * @dev Transfer master permission
     */
    function updateMaster(
        address _newMaster
    )
        external
        onlyMaster
    {
        masterAddress = _newMaster;
    }

    /**
     * @dev Destroy Master functionality
     */
    function revokeMaster()
        external
        onlyMaster
    {
        masterAddress = ZERO_ADDRESS;
    }

    /**
     * @dev Clone the implemenation for a token into a new contract.
     * Call into initialize for the locker to begin the LiquidNFT loan process.
     * Transfer the NFT the user wants use for the loan into the locker.
     */
    function createLiquidLocker(
        uint256[] calldata _tokenId,
        address _tokenAddress,
        uint256 _floorAsked,
        uint256 _deltaAsked,
        uint256 _paymentTime,
        uint256 _paymentRate,
        address _paymentToken
    )
        external
        returns (address lockerAddress)
    {
        if (_paymentRate > RATE_MAX) revert("INVALID_RATE");

        lockerAddress = _generateLocker(
            _paymentToken
        );

        ILiquidLocker(lockerAddress).initialize(
            _tokenId,
            _tokenAddress,
            msg.sender,
            _floorAsked,
            _floorAsked + _deltaAsked,
            _paymentTime,
            _paymentRate
        );

        for (uint256 i = 0; i < _tokenId.length; i++) {
            _transferFromNFT(
                msg.sender,
                lockerAddress,
                _tokenAddress,
                _tokenId[i]
            );
        }

        emit NewLocker(
            lockerAddress,
            msg.sender,
            _tokenAddress
        );
    }

    /**
     * @dev Clone the byte code from one contract into a new contract. Uses solidity assembly.
     * This is a lot cheaper in gas than deploying a new contract.
     */
    function _generateLocker(
        address _paymentToken
    )
        internal
        returns (address lockerAddress)
    {
        bytes20 targetBytes = bytes20(
            getImplementation(_paymentToken)
        );

        assembly {

            let clone := mload(0x40)

            mstore(
                clone,
                0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000
            )

            mstore(
                add(clone, 0x14),
                targetBytes
            )

            mstore(
                add(clone, 0x28),
                0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000
            )

            lockerAddress := create(0, clone, 0x37)
        }
    }

    /**
     * @dev Call contributeToLocker. Factory acts as a middle man between the user and the locker.
     * We do this so that the user only has to approve the factory and not each new locker.
     */
    function contributeToLocker(
        address _lockersAddress,
        uint256 _paymentAmount
    )
        external
        returns (
            uint256 totalIncrease,
            uint256 usersIncrease
        )
    {
        ILiquidLocker locker = ILiquidLocker(
            _lockersAddress
        );

        (totalIncrease, usersIncrease) = locker.makeContribution(
            _paymentAmount,
            msg.sender
        );

        _safeTransferFrom(
            locker.PAYMENT_TOKEN(),
            msg.sender,
            _lockersAddress,
            usersIncrease
        );

        emit ContributeToLocker(
            _lockersAddress,
            msg.sender,
            usersIncrease,
            totalIncrease
        );
    }

    /**
     * @dev Give tokens to a locker. These tokens do not go toward paying off the loan,
     * they are instead distributed among the contributors for the loan.
     * The result of this is that the value is transferred to the contributors not the owner because it does
     * not deduct from the balance the owner owes.
     */
    function donateToLocker(
        address _lockersAddress,
        uint256 _donationAmount
    )
        external
    {
        ILiquidLocker locker = ILiquidLocker(
            _lockersAddress
        );

        locker.donateFunds(
            _donationAmount
        );

        _safeTransferFrom(
            locker.PAYMENT_TOKEN(),
            msg.sender,
            _lockersAddress,
            _donationAmount
        );

        emit DonateToLocker(
            _lockersAddress,
            msg.sender,
            _donationAmount
        );
    }

    /**
     * @dev Call paybackToLocker. Factory acts as a middle man between the user and the locker.
     * We do this so that the user only has to approve the factory and not each new locker.
     */
    function paybackToLocker(
        address _lockersAddress,
        uint256 _paymentAmount
    )
        external
    {
        ILiquidLocker locker = ILiquidLocker(
            _lockersAddress
        );

        locker.payBackFunds(
            _paymentAmount,
            msg.sender
        );

        _safeTransferFrom(
            locker.PAYMENT_TOKEN(),
            msg.sender,
            _lockersAddress,
            _paymentAmount
        );

        emit PaybackToLocker(
            _lockersAddress,
            msg.sender,
            _paymentAmount
        );
    }

    /**
     * @dev Returns the address that the factory will attempt to clone a locker from for a given token.
     */
    function getImplementation(
        address _paymentToken
    )
        public
        view
        returns (address implementation)
    {
        implementation = implementations[_paymentToken] == ZERO_ADDRESS
            ? defaultTarget
            : implementations[_paymentToken];
    }

    /**
     * @dev Call ERC20 transferFrom and then check the returned bool for success.
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
            "LiquidFactory: TRANSFER_FROM_FAILED"
        );
    }
}
