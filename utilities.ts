/** Utility function to check if object is empty
 * @param {object} obj
 * @return {boolean}
 */
function isEmpty(obj: object): boolean {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      return false;
    }
  }
  return true;
}

exports.isEmpty = isEmpty;
