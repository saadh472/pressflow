package com.pressflow;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;

class StudioIntegrationTest {
    static ServletWebServerApplicationContext context;
    static Path database;
    static final ObjectMapper json=new ObjectMapper();
    HttpClient client;
    String token;
    record Result(int status, JsonNode body) {}
    @BeforeAll static void start() throws Exception {
        database=Files.createTempDirectory("pressflow-test-").resolve("studio.sqlite");
        context=open();
    }
    static ServletWebServerApplicationContext open() {
        return (ServletWebServerApplicationContext)new SpringApplicationBuilder(PressFlowApplication.class)
            .run("--server.port=0","--spring.datasource.url=jdbc:sqlite:"+database,"--logging.level.root=ERROR");
    }
    @AfterAll static void stop() { if(context!=null) context.close(); }
    @BeforeEach void reset() {
        JdbcTemplate db=context.getBean(JdbcTemplate.class);
        for(String table:List.of("requests","payments","orders")) db.update("DELETE FROM "+table);
        db.update("DELETE FROM customers WHERE id>3");
        db.update("DELETE FROM services WHERE id>4");
        String[] names={"Business cards","Flyers","Brochures","Posters"};
        long[] prices={1500,3500,8500,25000};
        for(int i=0;i<4;i++) db.update("UPDATE services SET name=?,unit_price=?,active=1,version=0 WHERE id=?",names[i],prices[i],i+1);
        client=HttpClient.newBuilder().cookieHandler(new CookieManager(null,CookiePolicy.ACCEPT_ALL)).build();
        token=null;
    }
    Result call(String method,String path,Object payload,boolean csrf) throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+context.getWebServer().getPort()+"/api"+path));
        if(csrf && token!=null) request.header("X-CSRF-TOKEN",token);
        if(payload!=null) request.header("Content-Type","application/json").method(method,HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload)));
        else request.method(method,HttpRequest.BodyPublishers.noBody());
        var response=client.send(request.build(),HttpResponse.BodyHandlers.ofString());
        return new Result(response.statusCode(),response.body().isBlank()?json.nullNode():json.readTree(response.body()));
    }
    void login() throws Exception {
        token=call("GET","/session",null,false).body.path("csrfToken").asText();
        var result=call("POST","/login",Map.of("username","operator","password","DemoPass123!"),true);
        assertEquals(200,result.status,result.body.toString());
        token=result.body.path("csrfToken").asText();
    }
    Map<String,Object> orderInput(boolean laminate) {
        Map<String,Object> input=new LinkedHashMap<>();
        input.put("customerId",1); input.put("title","Fictional launch cards"); input.put("serviceId",1);
        input.put("quantity",10); input.put("paper","PLAIN"); input.put("lamination",laminate);
        input.put("dueDate",LocalDate.now().plusDays(3).toString()); input.put("requestId",UUID.randomUUID().toString());
        return input;
    }
    JsonNode create(boolean laminate) throws Exception {
        var result=call("POST","/orders",orderInput(laminate),true); assertEquals(201,result.status,result.body.toString()); return result.body;
    }
    @Test void anonymousRequestsAndCsrfAreGuarded() throws Exception {
        assertEquals(401,call("GET","/orders",null,false).status);
        assertEquals(403,call("POST","/orders",orderInput(false),false).status);
        var session=call("GET","/session",null,false);
        assertFalse(session.body.path("authenticated").asBoolean()); assertFalse(session.body.path("csrfToken").asText().isEmpty());
    }
    @Test void loginRotatesTokenAndLogoutRevokesSession() throws Exception {
        token=call("GET","/session",null,false).body.path("csrfToken").asText();
        assertEquals(401,call("POST","/login",Map.of("username","operator","password","incorrect"),true).status);
        String before=token; login(); assertNotEquals(before,token);
        assertEquals(200,call("GET","/orders",null,false).status);
        assertEquals(200,call("POST","/logout",Map.of(),true).status);
        assertEquals(401,call("GET","/orders",null,false).status);
    }
    @Test void quoteUsesServerPricesAndWholeNumberCents() throws Exception {
        login();
        var result=call("POST","/quote",Map.of("serviceId",2,"quantity",100,"paper","PREMIUM","lamination",true),true);
        assertEquals(200,result.status); assertEquals(6200,result.body.path("unitPriceCents").asLong()); assertEquals(620000,result.body.path("totalCents").asLong());
        assertEquals(400,call("POST","/quote",Map.of("serviceId",2,"quantity",1.5,"paper","PLAIN","lamination",false),true).status);
    }
    @Test void orderCreationIsIdempotentAndRejectsChangedRetry() throws Exception {
        login(); var input=orderInput(false);
        var first=call("POST","/orders",input,true); var retry=call("POST","/orders",input,true);
        assertEquals(201,first.status); assertEquals(first.body.path("id"),retry.body.path("id"));
        assertEquals(15000,first.body.path("totalCents").asLong());
        input.put("quantity",11); assertEquals(409,call("POST","/orders",input,true).status);
        assertEquals(1,call("GET","/orders",null,false).body.size());
    }
    @Test void invalidOrdersLeaveNoPartialRecords() throws Exception {
        login(); var input=orderInput(false); input.put("quantity",0);
        assertEquals(400,call("POST","/orders",input,true).status);
        input=orderInput(false); input.put("dueDate",LocalDate.now().minusDays(1).toString());
        assertEquals(400,call("POST","/orders",input,true).status);
        input=orderInput(false); input.put("customerId",9999);
        assertEquals(400,call("POST","/orders",input,true).status);
        input=orderInput(false); input.put("totalCents",1);
        assertEquals(400,call("POST","/orders",input,true).status);
        assertEquals(0,call("GET","/orders",null,false).body.size());
    }
    @Test void productionStagesCannotSkipAndUseOptimisticVersion() throws Exception {
        login(); var order=create(true); long id=order.path("id").asLong();
        assertEquals(409,call("POST","/orders/"+id+"/transition",Map.of("status","READY","version",0),true).status);
        int version=0;
        for(String status:List.of("DESIGN","PRINTING","LAMINATION","READY","DELIVERED")) {
            var result=call("POST","/orders/"+id+"/transition",Map.of("status",status,"version",version++),true);
            assertEquals(200,result.status,result.body.toString()); assertEquals(status,result.body.path("status").asText());
        }
        assertEquals(409,call("POST","/orders/"+id+"/transition",Map.of("status","CANCELLED","version",5),true).status);
    }
    @Test void staleProductionVersionDoesNotOverwriteChanges() throws Exception {
        login(); long id=create(false).path("id").asLong();
        assertEquals(200,call("POST","/orders/"+id+"/transition",Map.of("status","DESIGN","version",0),true).status);
        assertEquals(409,call("POST","/orders/"+id+"/transition",Map.of("status","PRINTING","version",0),true).status);
        assertEquals("DESIGN",call("GET","/orders/"+id,null,false).body.path("status").asText());
    }
    @Test void paymentsAreIdempotentBoundedAndCannotBeSilentlyCancelled() throws Exception {
        login(); long id=create(false).path("id").asLong();
        var input=new LinkedHashMap<String,Object>(Map.of("amountCents",5000,"method","CASH","reference","Fictional receipt","requestId",UUID.randomUUID().toString()));
        assertEquals(201,call("POST","/orders/"+id+"/payments",input,true).status);
        assertEquals(201,call("POST","/orders/"+id+"/payments",input,true).status);
        assertEquals(1,call("GET","/payments",null,false).body.size());
        input.put("amountCents",6000); assertEquals(409,call("POST","/orders/"+id+"/payments",input,true).status);
        input.put("requestId",UUID.randomUUID().toString()); input.put("amountCents",10001);
        assertEquals(400,call("POST","/orders/"+id+"/payments",input,true).status);
        assertEquals(409,call("POST","/orders/"+id+"/transition",Map.of("status","CANCELLED","version",0),true).status);
        assertEquals(10000,call("GET","/orders/"+id,null,false).body.path("balanceCents").asLong());
    }
    @Test void cancelledOrderHasNoOutstandingBalanceAndRejectsPayment() throws Exception {
        login(); long id=create(false).path("id").asLong();
        var cancelled=call("POST","/orders/"+id+"/transition",Map.of("status","CANCELLED","version",0),true);
        assertEquals(200,cancelled.status); assertEquals(0,cancelled.body.path("balanceCents").asLong());
        assertEquals(409,call("POST","/orders/"+id+"/payments",Map.of("amountCents",1,"method","CASH","reference","","requestId",UUID.randomUUID().toString()),true).status);
        assertEquals(0,call("GET","/dashboard",null,false).body.path("outstandingCents").asLong());
    }
    @Test void duplicateCustomerEmailIsRejectedWithoutDamagingExistingData() throws Exception {
        login();
        var input=Map.of("name","New fictional customer","email","ALEX@example.com","phone","+00 9999","company","Example");
        assertEquals(409,call("POST","/customers",input,true).status);
        assertEquals(3,call("GET","/customers",null,false).body.size());
    }
    @Test void simultaneousPaymentsCannotExceedOrderBalance() throws Exception {
        login(); long id=create(false).path("id").asLong();
        ExecutorService threads=Executors.newFixedThreadPool(2);
        try {
            var jobs=List.<Callable<Result>>of(
                ()->call("POST","/orders/"+id+"/payments",Map.of("amountCents",10000,"method","CASH","requestId",UUID.randomUUID().toString()),true),
                ()->call("POST","/orders/"+id+"/payments",Map.of("amountCents",10000,"method","CASH","requestId",UUID.randomUUID().toString()),true));
            var results=threads.invokeAll(jobs).stream().map(f->{try{return f.get().status;}catch(Exception e){throw new RuntimeException(e);}}).sorted().toList();
            assertEquals(List.of(201,400),results);
            assertEquals(10000,call("GET","/orders/"+id,null,false).body.path("paidCents").asLong());
        } finally { threads.shutdownNow(); }
    }
    @Test void sqliteRecordsSurviveARealApplicationRestart() throws Exception {
        login(); long id=create(false).path("id").asLong();
        context.close(); context=open(); login();
        assertEquals(id,call("GET","/orders/"+id,null,false).body.path("id").asLong());
        assertEquals(15000,call("GET","/orders/"+id,null,false).body.path("totalCents").asLong());
    }
    @Test void catalogSupportsCreateEditArchiveWithoutChangingOldQuotes() throws Exception {
        login(); var old=create(false); long orderId=old.path("id").asLong();
        var service=Map.of("name","Business cards revised","description","Updated fictional service","unitPriceCents",2000,"active",true,"version",0);
        assertEquals(200,call("PUT","/services/1",service,true).status);
        assertEquals(409,call("PUT","/services/1",service,true).status);
        var previous=call("GET","/orders/"+orderId,null,false);
        assertEquals("Business cards",previous.body.path("serviceName").asText());
        assertEquals(15000,previous.body.path("totalCents").asLong());
        assertEquals(20000,call("POST","/quote",Map.of("serviceId",1,"quantity",10,"paper","PLAIN","lamination",false),true).body.path("totalCents").asLong());
        assertEquals(200,call("PUT","/services/1",Map.of("name","Business cards revised","description","Archived sample","unitPriceCents",2000,"active",false,"version",1),true).status);
        assertEquals(400,call("POST","/quote",Map.of("serviceId",1,"quantity",10,"paper","PLAIN","lamination",false),true).status);
        assertEquals(200,call("GET","/orders/"+orderId,null,false).status);
        var added=call("POST","/services",Map.of("name","Fictional stickers","description","Die-cut sample sheets","unitPriceCents",9900,"active",true),true);
        assertEquals(201,added.status,added.body.toString()); assertTrue(added.body.path("active").asBoolean());
        assertEquals(0,added.body.path("version").asInt());
    }
    @Test void catalogRejectsInvalidPricesDuplicateNamesAndUnauthenticatedWrites() throws Exception {
        login();
        for(Object price:List.of(-1,0,1.5,5000001))
            assertEquals(400,call("POST","/services",Map.of("name","Invalid sample","description","Sample","unitPriceCents",price,"active",true),true).status);
        assertEquals(409,call("POST","/services",Map.of("name","BUSINESS CARDS","description","Duplicate","unitPriceCents",100,"active",true),true).status);
        assertEquals(400,call("PUT","/services/1",Map.of("name","Business cards","description","Missing version","unitPriceCents",100,"active",true),true).status);
        assertEquals(4,call("GET","/services",null,false).body.size());
    }
    @Test void olderSqliteSchemaUpgradesWithoutLosingAnExistingOrder() throws Exception {
        Path original=database;
        Path legacy=Files.createTempDirectory("pressflow-v1-").resolve("legacy.sqlite");
        context.close();
        try {
            try(var connection=java.sql.DriverManager.getConnection("jdbc:sqlite:"+legacy);var sql=connection.createStatement()) {
                sql.execute("CREATE TABLE customers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL COLLATE NOCASE UNIQUE,phone TEXT NOT NULL,company TEXT NOT NULL DEFAULT '')");
                sql.execute("CREATE TABLE services(id INTEGER PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,unit_price INTEGER NOT NULL)");
                sql.execute("CREATE TABLE orders(id INTEGER PRIMARY KEY AUTOINCREMENT,customer_id INTEGER NOT NULL,title TEXT NOT NULL,service_id INTEGER NOT NULL,quantity INTEGER NOT NULL,paper TEXT NOT NULL,lamination INTEGER NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'NEW',total INTEGER NOT NULL,created_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0)");
                sql.execute("INSERT INTO customers VALUES(1,'Legacy fictional customer','legacy@example.com','+00 1111','Example')");
                sql.execute("INSERT INTO services VALUES(1,'Legacy cards','Original sample',700)");
                sql.execute("INSERT INTO orders VALUES(10,1,'Saved sample order',1,10,'PLAIN',0,'2026-12-01','NEW',7000,'2026-11-01T00:00:00Z',0)");
                sql.execute("PRAGMA user_version=1");
            }
            database=legacy; context=open(); login();
            var order=call("GET","/orders/10",null,false);
            assertEquals(200,order.status); assertEquals(7000,order.body.path("totalCents").asLong());
            assertEquals("Legacy cards",order.body.path("serviceName").asText());
            assertEquals(2,context.getBean(JdbcTemplate.class).queryForObject("PRAGMA user_version",Integer.class));
        } finally { context.close(); database=original; context=open(); }
    }
}
