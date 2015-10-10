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
  * iron_worker run warehouse.manual.mongo --payload-file ./tests/local.patricias.41st.import.payload.json
  * iron_worker run warehouse.manual.mongo --payload-file ./tests/local.patricias.41st.sched.payload.json
  * iron_worker run warehouse.manual.mongo --payload-file ./tests/staging.patricias.sched.payload.json

* iron_worker upload wh.order.gen.parallel --worker-config iron.json
  * iron_worker run wh.order.gen.parallel --worker-config iron.json --payload-file ./tests/local.fermiyontest.norman.ffcc.paged.generate.payload.json
  * iron_worker run wh.order.gen.parallel --worker-config iron.json --payload-file ./tests/local.fermiyontest.norman.ffcc.paged.process.payload.json

* iron_worker upload create.consignment.products
  * iron_worker run create.consignment.products --payload-file ./tests/local.patricias.41st.import.payload.json

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
--cluster default \
--payload-file ./relative/path/to/YOUR_FILE_NAME
  ```

* Test scheduling

  ```
  iron_worker schedule warehouse.manual.mongo --label test1 --start-at "2015-10-05T08:00:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./tests/local.fermiyontest.okc.ffcc.sched.payload.json
  ```

* create all scheduled jobs in one fell swoop with cascading/staggered run times

  ```
iron_worker schedule warehouse.manual.mongo --label patricias.11th.ffcc --start-at "2015-10-05T01:50:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.11th.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.11th.csc --start-at "2015-10-05T02:00:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.11th.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.41st.ffcc --start-at "2015-10-05T02:10:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.41st.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.41st.csc --start-at "2015-10-05T02:20:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.41st.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.71st.ffcc --start-at "2015-10-05T02:30:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.71st.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.71st.csc --start-at "2015-10-05T02:40:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.71st.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.arm.ffcc --start-at "2015-10-05T02:50:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.arm.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.arm.csc --start-at "2015-10-05T03:00:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.arm.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.cave.ffcc --start-at "2015-10-05T03:10:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.cave.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.cave.csc --start-at "2015-10-05T03:20:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.cave.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.garr.ffcc --start-at "2015-10-05T03:30:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.garr.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.garr.csc --start-at "2015-10-05T03:40:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.garr.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.glen.ffcc --start-at "2015-10-05T03:50:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.glen.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.glen.csc --start-at "2015-10-05T04:00:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.glen.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.grav.ffcc --start-at "2015-10-05T04:10:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.grav.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.grav.csc --start-at "2015-10-05T04:20:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.grav.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.kell.ffcc --start-at "2015-10-05T04:30:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.kell.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.kell.csc --start-at "2015-10-05T04:40:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.kell.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.memo.ffcc --start-at "2015-10-05T04:50:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.memo.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.memo.csc --start-at "2015-10-05T05:00:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.memo.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.neil.ffcc --start-at "2015-10-05T05:10:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.neil.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.neil.csc --start-at "2015-10-05T05:20:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.neil.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.page.ffcc --start-at "2015-10-05T05:30:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.page.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.page.csc --start-at "2015-10-05T05:40:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.page.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.park.ffcc --start-at "2015-10-05T05:50:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.park.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.park.csc --start-at "2015-10-05T06:00:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.park.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.reno.ffcc --start-at "2015-10-05T06:10:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.reno.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.reno.csc --start-at "2015-10-05T06:20:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.reno.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.rock.ffcc --start-at "2015-10-05T06:30:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.rock.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.rock.csc --start-at "2015-10-05T06:40:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.rock.csc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.skel.ffcc --start-at "2015-10-05T06:50:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.skel.ffcc.payload.json && \
iron_worker schedule warehouse.manual.mongo --label patricias.skel.csc --start-at "2015-10-05T07:00:00-05:00" --run-every 604800 --timeout 600 --priority 2 --cluster default --payload-file ./seed/staging.skel.csc.payload.json
  ```