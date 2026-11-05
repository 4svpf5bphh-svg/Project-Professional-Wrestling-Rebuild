/** One presentation skeleton for wrestler search controls.
 * The caller owns roster queries, filters and booking permissions.
 * No shared store or additional Neon requests are introduced here.
 */
export function createTalentFilterFrame(
 search:HTMLElement,sortAndDivision:HTMLElement,chips:HTMLElement,
):HTMLElement{
 const root=document.createElement("section");
 root.className="ppw-talent-controls";
 search.classList.add("ppw-talent-search");
 sortAndDivision.classList.add("ppw-talent-sort-row");
 chips.classList.add("ppw-talent-chip-row");
 root.append(search,sortAndDivision,chips);
 return root;
}
