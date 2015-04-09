1. The first thing we need to do is add the worker to our Iron.io account.

  ```
$ iron_worker upload https://raw.github.com/shoppinpal/warehouse-manager-generate-stock-order/master/warehouse.manager.generate.stock.order.worker
  ```

2. Now that it's in our account, we can start queuing up jobs/tasks using the IronWorker API, which is simply an HTTP request with a payload so we can do it from any language or even curl:

  ```
$ curl https://worker-aws-us-east-1.iron.io/2/projects/YOUR_PROJECT_ID/tasks
  --header "Authorization: OAuth YOUR_TOKEN" \
  --header "Content-Type: application/json" \
  -d '{
      "tasks": [
        {
          "code_name": "hello",
          "payload": "{\n  \"token_service\": \"https:\/\/{DOMAIN_PREFIX}.vendhq.com\/api\/1.0\/token\",\n  \"client_id\": \"SUBSTITUTE\",\n  \"client_secret\": \"SUBSTITUTE\",\n  \"access_token\": \"SUBSTITUTE\",\n  \"token_type\": \"Bearer\",\n  \"refresh_token\": \"SUBSTITUTE\",\n  \"domain_prefix\": \"SUBSTITUTE\",\n  \"loopbackAccessToken\": \"SUBSTITUTE\",\n  \"reportId\":SUBSTITUTE,\n  \"outletId\":\"SUBSTITUTE\",\n  \"supplierId\":\"SUBSTITUTE\"\n}"
        }
      ]
    }'
  ```
