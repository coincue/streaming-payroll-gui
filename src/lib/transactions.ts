import { ethers } from 'ethers'
import { getProvider } from './eth'

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)'
]

export type TransactionResult = {
  success: boolean
  txHash?: string
  blockNumber?: number
  timestamp?: number
  error?: string
}

export async function sendETHPayment(
  toAddress: string,
  amountInETH: number
): Promise<TransactionResult> {
  try {
    const provider = getProvider()
    if (!provider) {
      return { success: false, error: 'No provider found' }
    }

    const ethersProvider = new ethers.BrowserProvider(provider)
    const signer = await ethersProvider.getSigner()
    
    // Amount is already in ETH, round to 18 decimals
    const roundedAmountInETH = Number(amountInETH.toFixed(18))
    const value = ethers.parseEther(roundedAmountInETH.toString())

    const tx = await signer.sendTransaction({
      to: toAddress,
      value
    })

    const receipt = await tx.wait()
    if (!receipt) {
      return { success: false, error: 'Transaction failed' }
    }

    const block = await ethersProvider.getBlock(receipt.blockNumber)
    
    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      timestamp: block?.timestamp
    }
  } catch (error: any) {
    console.error('Error sending ETH payment:', error)
    return {
      success: false,
      error: error.message || 'Transaction failed'
    }
  }
}

export async function sendUSDCPayment(
  toAddress: string,
  amountInDollars: number,
  usdcContractAddress: string
): Promise<TransactionResult> {
  try {
    const provider = getProvider()
    if (!provider) {
      return { success: false, error: 'No provider found' }
    }

    const ethersProvider = new ethers.BrowserProvider(provider)
    const signer = await ethersProvider.getSigner()
    
    const contract = new ethers.Contract(usdcContractAddress, ERC20_ABI, signer)
    const decimals = await contract.decimals()
    
    // USDC is 1:1 with USD
    // Round to 6 decimals for USDC
    const roundedAmount = Number(amountInDollars.toFixed(decimals))
    const amount = ethers.parseUnits(roundedAmount.toString(), decimals)

    const tx = await contract.transfer(toAddress, amount)
    const receipt = await tx.wait()
    
    if (!receipt) {
      return { success: false, error: 'Transaction failed' }
    }

    const block = await ethersProvider.getBlock(receipt.blockNumber)
    
    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      timestamp: block?.timestamp
    }
  } catch (error: any) {
    console.error('Error sending USDC payment:', error)
    return {
      success: false,
      error: error.message || 'Transaction failed'
    }
  }
}

export async function executePayment(
  toAddress: string,
  amountInDollars: number,
  tokenType: 'ETH' | 'USDC',
  usdcContractAddress?: string
): Promise<TransactionResult> {
  if (tokenType === 'ETH') {
    return sendETHPayment(toAddress, amountInDollars)
  }
  
  if (!usdcContractAddress) {
    return { success: false, error: 'USDC contract address required' }
  }
  
  return sendUSDCPayment(toAddress, amountInDollars, usdcContractAddress)
}
