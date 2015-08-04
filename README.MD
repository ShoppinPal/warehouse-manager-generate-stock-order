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
3. If you want to do it the old-fashioned way, you can always test locally with:
  ```
$ iron_worker run warehouse-manager-generate-stock-order --payload-file ./tests/payload.json
  ```
4. And deploy with:
  ```
$ iron_worker upload warehouse-manager-generate-stock-order
  ```

* iron_worker upload warehouse.manual.mongo
  * iron_worker run warehouse.manual.mongo --payload-file ./tests/local.fermiyontest.norman.ffcc.sched.payload.json
  * iron_worker run warehouse.manual.mongo --payload-file ./tests/local.patricias.sched.payload.json
  * iron_worker run warehouse.manual.mongo --payload-file ./tests/staging.patricias.sched.payload.json

## Scheduled Jobs

CDT is -0500
CST is -0600
so 8am CDT will turn into 7am CST?

7 days = 7*24*60*60 = 604800 seconds
1 day = 24*60*60 = 86400 seconds
10 minutes = 10 * 60 = 600 seconds

* How to create a scheduled job from command line?
  ```
iron_worker schedule warehouse.manual.mongo \
--label test1 \
--start-at "2015-01-01T08:00:00-05:00" \
--run-every 604800 \
--timeout 600 \
--priority 2 \
--cluster azure \
--payload-file ./relative/path/to/YOUR_FILE_NAME
  ```

* create 4 scheduled jobs in one fell swoop
  ```
iron_worker schedule warehouse.manual.mongo --label staging.rock.ffcc --start-at "2015-01-01T08:00:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster azure --payload-file ./seed/staging.rock.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label staging.rock.csc --start-at "2015-01-01T08:00:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster azure --payload-file ./seed/staging.rock.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label staging.reno.ffcc --start-at "2015-01-01T08:00:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster azure --payload-file ./seed/staging.reno.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label staging.reno.csc --start-at "2015-01-01T08:00:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster azure --payload-file ./seed/staging.reno.csc.payload.json
  ```