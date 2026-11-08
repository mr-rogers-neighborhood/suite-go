/** Lower kebab-case. The same rule Start uses for suite app ids, so an id can carry over. */
const MODULE_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
/** True when a string is a legal module id. The one check the container makes on a declaration. */
export function isSuiteGoModuleId(value) {
    return MODULE_ID_PATTERN.test(value);
}
//# sourceMappingURL=module.js.map