// SPDX-License-Identifier: MIT

pragma solidity 0.8.6;

import { ReentrancyGuard } from "../external/openzeppelin/ReentrancyGuard.sol";
import { SafeERC20, IERC20 } from "../libraries/SafeERC20.sol";
import { StableMath } from "../libraries/StableMath.sol";

import { RewardsDistribution } from "../helpers/RewardsDistribution.sol";
import { Parameterized } from "../helpers/Parameterized.sol";

/**
 * @title  Staking
 * @notice Rewards stakers of given token with rewards in form of reward token, on a pro-rata basis.
 * @dev    Uses an ever increasing 'rewardPerTokenStored' variable to distribute rewards
 *         each time a write action is called in the contract. This allows for passive reward accrual.
 */
contract LPMining is ReentrancyGuard, RewardsDistribution, Parameterized {
    using StableMath for uint256;
    using SafeERC20 for IERC20;

    /// @notice staking token address
    address public stakingToken;
    /// @notice rewards token address
    address public rewardsToken;
    /// @notice fee collecting address
    address public feeCollector;

    /// @notice timestamp for current period finish
    uint256 public periodFinish;
    /// @notice rewardRate for the rest of the period
    uint256 public rewardRate;
    /// @notice last time any user took action
    uint256 public lastUpdateTime;
    /// @notice accumulated per token reward since the beginning of time
    uint256 public rewardPerTokenStored;
    /// @notice amount of tokens that is used in reward per token calculation
    uint256 public stakedTokens;

    struct Stake {
        uint256 stakeStart; // timestamp of stake creation
        //
        uint256 rewardPerTokenPaid; // user accumulated per token rewards
        //
        uint256 tokens; // total tokens staked by user
        uint256 rewards; // current not-claimed rewards from last update
        //
        uint256 withdrawalPossibleAt; // timestamp after which stake can be removed without fee
        bool isWithdrawing; // true = user call to remove stake
    }

    /// @dev each holder have one stake
    /// @notice token stakes storage
    mapping(address => Stake) public tokenStake;

    /// @dev events
    event Claimed(address indexed user, uint256 amount);
    event StakeAdded(address indexed user, uint256 amount);
    event StakeRemoveRequested(address indexed user);
    event StakeRemoved(address indexed user, uint256 amount);
    event Recalculation(uint256 reward);

    /**
     * @dev One time initialization function
     * @param _stakingToken staking token address
     * @param _rewardsToken rewards token address
     * @param _feeCollector fee collecting address
     */
    function init(
        address _stakingToken,
        address _rewardsToken,
        address _feeCollector
    ) external onlyOwner {
        require(_stakingToken != address(0), "_stakingToken address cannot be 0");
        require(_rewardsToken != address(0), "_rewardsToken address cannot be 0");
        require(_feeCollector != address(0), "_feeCollector address cannot be 0");
        require(stakingToken == address(0), "init already done");
        stakingToken = _stakingToken;
        rewardsToken = _rewardsToken;
        feeCollector = _feeCollector;

        timeToUnstake.value = WEEK;
        unstakeFee.value = 1000;
        periodLength.value = MONTH;
    }

    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "_feeCollector address cannot be 0");
        feeCollector = _feeCollector;
    }

    /**
     * @dev Updates the reward for a given address,
     *      before executing function
     * @param _account address for which rewards will be updated
     */
    modifier updateReward(address _account) {
        _updateReward(_account);
        _;
    }

    /**
     * @dev guards that the msg.sender has token stake
     */
    modifier hasStake() {
        require(tokenStake[msg.sender].tokens > 0, "nothing staked");
        _;
    }

    /**
     * @dev checks if the msg.sender can withdraw requested unstake
     */
    modifier canUnstake() {
        require(_canUnstake(), "cannot unstake");
        _;
    }

    /**
     * @dev checks if for the msg.sender there is possibility to
     *      withdraw staked tokens without fee.
     */
    modifier cantUnstake() {
        require(!_canUnstake(), "unstake first");
        _;
    }

    /***************************************
                    ACTIONS
    ****************************************/

    /**
     * @dev Updates reward
     * @param _account address for which rewards will be updated
     */
    function _updateReward(address _account) internal {
        uint256 newRewardPerTokenStored = currentRewardPerTokenStored();
        // if statement protects against loss in initialization case
        if (newRewardPerTokenStored > 0) {
            rewardPerTokenStored = newRewardPerTokenStored;
            lastUpdateTime = lastTimeRewardApplicable();

            // setting of personal vars based on new globals
            if (_account != address(0)) {
                Stake storage s = tokenStake[_account];
                if (!s.isWithdrawing) {
                    s.rewards = _earned(_account);
                    s.rewardPerTokenPaid = newRewardPerTokenStored;
                }
            }
        }
    }

    /**
     * @dev Add tokens to staking contract
     * @param _amount of tokens to stake
     */
    function addStake(uint256 _amount) external {
        _addStake(msg.sender, _amount);
        emit StakeAdded(msg.sender, _amount);
    }

    /**
     * @dev Add tokens to staking contract by using permit to set allowance
     * @param _amount of tokens to stake
     * @param _deadline of permit signature
     * @param _approveMax allowance for the token
     */
    function addStakeWithPermit(
        uint256 _amount,
        uint256 _deadline,
        bool _approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        uint256 value = _approveMax ? type(uint256).max : _amount;
        IERC20(stakingToken).permit(msg.sender, address(this), value, _deadline, v, r, s);
        _addStake(msg.sender, _amount);
        emit StakeAdded(msg.sender, _amount);
    }

    /**
     * @dev Internal add stake function
     * @param _account staking tokens are credited to this address
     * @param _amount of staked tokens
     */
    function _addStake(address _account, uint256 _amount) internal nonReentrant updateReward(_account) {
        require(_amount > 0, "zero amount");
        Stake storage ts = tokenStake[_account];
        require(!ts.isWithdrawing, "cannot when withdrawing");

        // check for fee-on-transfer and proceed with received amount
        _amount = _transferFrom(stakingToken, msg.sender, _amount);

        if (ts.stakeStart == 0) {
            // new stake
            ts.stakeStart = block.timestamp;
        }

        // update account stake data
        ts.tokens += _amount;
        // update staking data
        stakedTokens += _amount;
    }

    /**
     * @dev Claims rewards for the msg.sender.
     */
    function claim() external {
        _claim(msg.sender, msg.sender);
    }

    /**
     * @dev Claim msg.sender rewards to provided address
     * @param _recipient address where claimed tokens should be sent
     */
    function claimTo(address _recipient) external {
        _claim(msg.sender, _recipient);
    }

    /**
     * @dev Internal claim function. First updates rewards
     *      and then transfers.
     * @param _account claim rewards for this address
     * @param _recipient claimed tokens are sent to this address
     */
    function _claim(address _account, address _recipient) internal nonReentrant hasStake updateReward(_account) {
        uint256 rewards = tokenStake[_account].rewards;
        require(rewards > 0, "nothing to claim");

        delete tokenStake[_account].rewards;
        _transfer(rewardsToken, _recipient, rewards);

        emit Claimed(_account, rewards);
    }

    /**
     * @dev Request unstake for deposited tokens. Marks user token stake as withdrawing,
     *      and start withdrawing period.
     */
    function requestUnstake() external {
        _requestUnstake(msg.sender);
        emit StakeRemoveRequested(msg.sender);
    }

    /**
     * @dev Internal request unstake function. Update rewards for the user first.
     * @param _account User address
     */
    function _requestUnstake(address _account) internal hasStake() updateReward(_account) {
        Stake storage ts = tokenStake[_account];
        require(!ts.isWithdrawing, "cannot when withdrawing");

        // update account stake data
        ts.isWithdrawing = true;
        ts.withdrawalPossibleAt = block.timestamp + timeToUnstake.value;
        // update pool staking data
        stakedTokens -= ts.tokens;
    }

    /**
     * @dev Withdraw stake for msg.sender from stake (if possible)
     */
    function unstake() external nonReentrant hasStake canUnstake {
        _unstake(false);
    }

    /**
     * @dev Unstake requested stake at any time accepting penalty fee
     */
    function unstakeWithFee() external nonReentrant hasStake cantUnstake {
        _unstake(true);
    }

    function _unstake(bool withFee) private {
        Stake memory ts = tokenStake[msg.sender];
        uint256 tokens;
        uint256 rewards;
        uint256 fee;

        if (ts.isWithdrawing) {
            tokens = withFee ? _minusFee(ts.tokens) : ts.tokens;
            fee = withFee ? (ts.tokens - tokens) : 0;
            rewards = ts.rewards;

            emit StakeRemoved(msg.sender, ts.tokens);
            delete tokenStake[msg.sender];
        }

        if (tokens > 0) {
            _transfer(stakingToken, msg.sender, tokens);
            if (fee > 0) {
                _transfer(stakingToken, feeCollector, fee);
            }
        }

        if (rewards > 0) {
            _transfer(rewardsToken, msg.sender, rewards);
            emit Claimed(msg.sender, rewards);
        }
    }

    /***************************************
                    GETTERS
    ****************************************/

    /**
     * @dev Gets the last applicable timestamp for this reward period
     */
    function lastTimeRewardApplicable() public view returns (uint256) {
        return StableMath.min(block.timestamp, periodFinish);
    }

    /**
     * @dev Calculates the amount of unclaimed rewards per token since last update,
     *      and sums with stored to give the new cumulative reward per token
     * @return 'Reward' per staked token
     */
    function currentRewardPerTokenStored() public view returns (uint256) {
        // If there is no staked tokens, avoid div(0)
        if (stakedTokens == 0) {
            return (rewardPerTokenStored);
        }
        // new reward units to distribute = rewardRate * timeSinceLastUpdate
        uint256 timeDelta = lastTimeRewardApplicable() - lastUpdateTime;
        uint256 rewardUnitsToDistribute = rewardRate * timeDelta;
        // new reward units per token = (rewardUnitsToDistribute * 1e18) / stakedTokens
        uint256 unitsToDistributePerToken = rewardUnitsToDistribute.divPrecisely(stakedTokens);
        // return summed rate
        return (rewardPerTokenStored + unitsToDistributePerToken);
    }

    /**
     * @dev Calculates the amount of unclaimed rewards a user has earned
     * @param _account user address
     * @return Total reward amount earned
     */
    function _earned(address _account) internal view returns (uint256) {
        Stake memory ts = tokenStake[_account];
        if (ts.isWithdrawing) return ts.rewards;

        // current rate per token - rate user previously received
        uint256 userRewardDelta = currentRewardPerTokenStored() - ts.rewardPerTokenPaid;
        uint256 userNewReward = ts.tokens.mulTruncate(userRewardDelta);

        // add to previous rewards
        return (ts.rewards + userNewReward);
    }

    /**
     * @dev Calculates the claimable amounts for token stake from rewards
     * @param _account user address
     */
    function claimable(address _account) external view returns (uint256) {
        return _earned(_account);
    }

    /**
     * @dev internal view to check if msg.sender can unstake
     * @return true if user requested unstake and time for unstake has passed
     */
    function _canUnstake() private view returns (bool) {
        return (tokenStake[msg.sender].isWithdrawing && block.timestamp >= tokenStake[msg.sender].withdrawalPossibleAt);
    }

    /**
     * @dev external view to check if address can stake tokens
     * @return true if user can stake tokens
     */
    function canStakeTokens(address _account) external view returns (bool) {
        return !tokenStake[_account].isWithdrawing;
    }

    /***************************************
                    REWARDER
    ****************************************/

    /**
     * @dev Notifies the contract that new rewards have been added.
     *      Calculates an updated rewardRate based on the rewards in period.
     * @param _reward Units of rewardsToken that have been added to the token pool
     */
    function notifyRewardAmount(uint256 _reward) external onlyRewardsDistributor updateReward(address(0)) {
        uint256 currentTime = block.timestamp;

        // pull tokens
        require(_transferFrom(rewardsToken, msg.sender, _reward) == _reward, "Exclude Rewarder from fee");

        // If previous period over, reset rewardRate
        if (currentTime >= periodFinish) {
            rewardRate = _reward / periodLength.value;
        }
        // If additional reward to existing period, calc sum
        else {
            uint256 remaining = periodFinish - currentTime;

            uint256 leftoverReward = remaining * rewardRate;
            rewardRate = (_reward + leftoverReward) / periodLength.value;
        }

        lastUpdateTime = currentTime;
        periodFinish = currentTime + periodLength.value;

        emit Recalculation(_reward);
    }

    /***************************************
                    TOKEN
    ****************************************/

    function _transferFrom(
        address _token,
        address _from,
        uint256 _amount
    ) internal returns (uint256) {
        return IERC20(_token).safeTransferFromDeluxe(_from, _amount);
    }

    function _transfer(
        address _token,
        address _to,
        uint256 _amount
    ) internal {
        IERC20(_token).safeTransfer(_to, _amount);
    }
}
