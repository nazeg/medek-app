/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("course_evaluations");

  // İlgili roller için listeleme ve görüntüleme (öğretim elemanı, bölüm başkanı, koordinatör, admin)
  collection.listRule = "@request.auth.role = 'instructor' || @request.auth.role = 'program_head' || @request.auth.role = 'coordinator' || @request.auth.role = 'admin'";
  collection.viewRule = "@request.auth.role = 'instructor' || @request.auth.role = 'program_head' || @request.auth.role = 'coordinator' || @request.auth.role = 'admin'";

  // Değerlendirme görüşü ekleme ve güncelleme yetkisi
  collection.createRule = "@request.auth.role = 'instructor' || @request.auth.role = 'program_head' || @request.auth.role = 'coordinator' || @request.auth.role = 'admin'";
  collection.updateRule = "@request.auth.role = 'instructor' || @request.auth.role = 'program_head' || @request.auth.role = 'coordinator' || @request.auth.role = 'admin'";
  
  // Silme yetkisi (bölüm başkanı veya admin)
  collection.deleteRule = "@request.auth.role = 'program_head' || @request.auth.role = 'admin'";

  return app.save(collection);
}, (app) => {
  return null;
});
