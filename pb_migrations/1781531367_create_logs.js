/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    const existing = app.findCollectionByNameOrId("logs");
    if (existing) {
      existing.listRule = "@request.auth.role = 'admin'";
      existing.viewRule = "@request.auth.role = 'admin'";
      existing.createRule = "";
      existing.deleteRule = "@request.auth.role = 'admin'";
      existing.updateRule = null;
      return app.save(existing);
    }
  } catch (e) {
    // collection does not exist
  }
  return null;
}, (app) => {
  return null;
});
