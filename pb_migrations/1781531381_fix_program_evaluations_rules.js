/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("program_evaluations");

  // Raporlarda görüntüleme: tüm yetkili roller (bölüm başkanı, koordinatör, admin, öğretim elemanı)
  collection.listRule = "@request.auth.role = 'program_head' || @request.auth.role = 'coordinator' || @request.auth.role = 'admin' || @request.auth.role = 'instructor'";
  collection.viewRule = "@request.auth.role = 'program_head' || @request.auth.role = 'coordinator' || @request.auth.role = 'admin' || @request.auth.role = 'instructor'";

  // Değerlendirme görüşü ekleme/güncelleme yetkisi: Bölüm Başkanı, Koordinatör ve Admin
  collection.createRule = "@request.auth.role = 'program_head' || @request.auth.role = 'coordinator' || @request.auth.role = 'admin'";
  collection.updateRule = "@request.auth.role = 'program_head' || @request.auth.role = 'coordinator' || @request.auth.role = 'admin'";
  collection.deleteRule = "@request.auth.role = 'program_head' || @request.auth.role = 'coordinator' || @request.auth.role = 'admin'";

  return app.save(collection);
}, (app) => {
  return null;
});
