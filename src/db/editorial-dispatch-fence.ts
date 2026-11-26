import {withSqlClient} from "./postgres.js";
import {withWorldTransaction,type TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";

/** World Updating validates its outer lease and pending article on one connection. */
export type EditorialDispatchFence=(db:SqlRows,lock:boolean)=>Promise<boolean>;

export class EditorialClaimLost extends Error{
 constructor(){super("Editorial dispatch claim expired or was superseded");}
}

async function requireClaim(db:SqlRows,fence:EditorialDispatchFence,lock:boolean){
 if(!await fence(db,lock))throw new EditorialClaimLost();
}

/** Serialize reservations with recovery. Release the row lock before network I/O. */
export function reserveEditorialAllowance<T>(pool:TransactionPool,
 fence:EditorialDispatchFence|undefined,reserve:(db:SqlRows)=>Promise<T>):Promise<T>{
 if(!fence)return withSqlClient(pool,reserve);
 return withWorldTransaction(pool,async tx=>{
  await requireClaim(tx,fence,true);
  return reserve(tx);
 });
}

/** Reservation uses asynchronous I/O. Recheck again before starting transport. */
export function checkEditorialDispatch(pool:TransactionPool,fence:EditorialDispatchFence){
 return withSqlClient(pool,db=>requireClaim(db,fence,false));
}
