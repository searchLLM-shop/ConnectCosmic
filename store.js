const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

function makeCollection(filename) {
  const filePath = path.join(DATA_DIR, filename);
  let items;
  try {
    items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    items = [];
  }

  function save() {
    fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
  }

  return {
    all: () => items,
    find: (pred) => items.find(pred),
    filter: (pred) => items.filter(pred),
    add: (item) => { items.push(item); save(); return item; },
    remove: (pred) => {
      const before = items.length;
      items = items.filter(i => !pred(i));
      save();
      return items.length !== before;
    },
    update: (pred, patch) => {
      const item = items.find(pred);
      if (!item) return null;
      Object.assign(item, patch);
      save();
      return item;
    },
  };
}

module.exports = {
  members: makeCollection('members.json'),
  memberships: makeCollection('memberships.json'),
  connections: makeCollection('connections.json'),
  broadcasts: makeCollection('broadcasts.json'),
  comments: makeCollection('comments.json'),
  ratings: makeCollection('ratings.json'),
};
