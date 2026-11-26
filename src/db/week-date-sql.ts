/** Convert a trusted SQL expression for a zero-based week index into the
 * (year, week) date used by the existing chronological indexes. A negative
 * index compares before the first valid PPW date, including at Genesis. */
export function weekDateSql(index:string){
 const value=`(${index})::integer`;
 return `ROW(${value}/52+1,${value}%52+1)`;
}

/** Leave the indexed columns bare. Both endpoints remain inclusive. */
export function weekDateRangeSql(alias:string,first:string,last:string){
 const prefix=alias?alias+".":"";
 return `ROW(${prefix}year,${prefix}week) BETWEEN ${weekDateSql(first)} AND ${weekDateSql(last)}`;
}
