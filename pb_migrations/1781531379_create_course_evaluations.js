/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collectionData = [
    {
      "name": "course_evaluations",
      "type": "base",
      "system": false,
      "listRule": "",
      "viewRule": "",
      "createRule": "",
      "updateRule": "",
      "deleteRule": "",
      "fields": [
        {
          "name": "course",
          "type": "text",
          "required": false,
          "presentable": false
        },
        {
          "name": "term",
          "type": "text",
          "required": false,
          "presentable": false
        },
        {
          "name": "mod_name",
          "type": "text",
          "required": false,
          "presentable": false
        },
        {
          "name": "opinion",
          "type": "text",
          "required": false,
          "presentable": false
        },
        {
          "name": "evaluator_name",
          "type": "text",
          "required": false,
          "presentable": false
        },
        {
          "name": "evaluator_title",
          "type": "text",
          "required": false,
          "presentable": false
        },
        {
          "name": "evaluator_date",
          "type": "text",
          "required": false,
          "presentable": false
        }
      ]
    }
  ];

  return app.importCollections(collectionData, false);
}, (app) => {
  return null;
});
