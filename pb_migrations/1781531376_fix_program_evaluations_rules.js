/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("program_evaluations");

  // Herkes okuyabilir (raporlarda görüntüleme)
  collection.listRule = "@request.auth.id != ''";
  collection.viewRule = "@request.auth.id != ''";

  // Sadece Bölüm Başkanı (program_head), Koordinatör veya Admin düzenleyebilir
  collection.createRule = "@request.auth.role = 'program_head' || @request.auth.role = 'admin' || @request.auth.role = 'coordinator'";
  collection.updateRule = "@request.auth.role = 'program_head' || @request.auth.role = 'admin' || @request.auth.role = 'coordinator'";
  collection.deleteRule = "@request.auth.role = 'program_head' || @request.auth.role = 'admin'";

  return app.save(collection);
}, (app) => {
  return null;
});
