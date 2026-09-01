/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    const collection = app.findCollectionByNameOrId("logs");
    collection.listRule = "@request.auth.role = 'admin'";
    collection.viewRule = "@request.auth.role = 'admin'";
    collection.createRule = "";
    collection.deleteRule = "@request.auth.role = 'admin'";
    collection.updateRule = null;
    return app.save(collection);
  } catch (e) {
    return null;
  }
}, (app) => {
  return null;
});
