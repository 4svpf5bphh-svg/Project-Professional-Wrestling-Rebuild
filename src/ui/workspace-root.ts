/** Clean mutually-exclusive page skins when switching major workspaces.
 * The app shell, authorisation state, page data and server calls stay intact.
 */
export type WorkspaceRootMode="ppw-planner"|"ppw-business"|"ppw-results"|
 "ppw-industry"|"ppw-programme-desk"|"ppw-directory";
const workspaceModes:readonly string[]=[
 "ppw-planner","ppw-business","ppw-results","ppw-industry",
 "ppw-programme-desk","ppw-directory","ppw-results-archive",
 "ppw-editorial-ready","ppw-business-ratings-focused","ppw-collection-screen"
];
export function activateWorkspaceRoot(root:HTMLElement,mode:WorkspaceRootMode){
 root.classList.remove(...workspaceModes);
 root.classList.add("ppw-editor",mode);
 // Rendering a new Results page can fail or still be loading. Neither
 // case should display a previous show's skin or event poster.
 delete root.dataset.resultsSkin;
 delete root.dataset.premiumPoster;
}
