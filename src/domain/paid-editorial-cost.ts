/** Model list-rate calculation for display only. This is NOT a billing ledger.
 * Backend £3 caps separately reserve a deliberately higher worst-case amount.
 * Input caching discounts and provider invoices are not assumed.
 */
export function estimateTerraStandardUsd(input:number|null,output:number|null):
 number|null{
 if(input===null||output===null||!Number.isSafeInteger(input)||
  !Number.isSafeInteger(output)||input<0||output<0)return null;
 return (input+output*5)/1_000_000;
}
