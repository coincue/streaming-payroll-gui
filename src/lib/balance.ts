import { ethers } from 'ethers'
import { getProvider } from './eth'

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
]

export async function getETHBalance(address: string): Promise<string> {
  try {
    const provider = getProvider()
    if (!provider) return '0'
    
    const ethersProvider = new ethers.BrowserProvider(provider)
    const balance = await ethersProvider.getBalance(address)
    const formatted = ethers.formatEther(balance)
    // Round to 6 decimals for consistency
    return (Math.floor(parseFloat(formatted) * 1000000) / 1000000).toString()
  } catch (error) {
    console.error('Error fetching ETH balance:', error)
    return '0'
  }
}

export async function getUSDCBalance(address: string, usdcAddress: string): Promise<string> {
  try {
    const provider = getProvider()
    if (!provider || !usdcAddress) return '0'
    
    const ethersProvider = new ethers.BrowserProvider(provider)
    const contract = new ethers.Contract(usdcAddress, ERC20_ABI, ethersProvider)
    
    const [balance, decimals] = await Promise.all([
      contract.balanceOf(address),
      contract.decimals()
    ])
    
    const formatted = ethers.formatUnits(balance, decimals)
    // Round to 6 decimals max for consistency
    const rounded = Math.floor(parseFloat(formatted) * 1000000) / 1000000
    return rounded.toString()
  } catch (error) {
    console.error('Error fetching USDC balance:', error)
    return '0'
  }
}

export async function getTokenBalance(
  address: string,
  tokenAddress: string,
  tokenType: 'ETH' | 'USDC'
): Promise<string> {
  if (tokenType === 'ETH') {
    return getETHBalance(address)
  }
  return getUSDCBalance(address, tokenAddress)
}
