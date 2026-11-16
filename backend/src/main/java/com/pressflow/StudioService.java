package com.pressflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;

@Service
class StudioService {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    StudioService(JdbcTemplate db, ObjectMapper json) { this.db=db; this.json=json; }
    record CustomerInput(@NotBlank @Size(max=100) String name, @NotBlank @Email @Size(max=180) String email,
        @NotBlank @Pattern(regexp="[+0-9 ()-]{5,25}") String phone, @Size(max=120) String company) {}
    record QuoteInput(@NotNull @Positive Long serviceId, @NotNull @Min(1) @Max(10000) Integer quantity,
        @NotNull @Pattern(regexp="PLAIN|PREMIUM") String paper, @NotNull Boolean lamination) {}
    record OrderInput(@NotNull @Positive Long customerId, @NotBlank @Size(max=140) String title,
        @NotNull @Positive Long serviceId, @NotNull @Min(1) @Max(10000) Integer quantity,
        @NotNull @Pattern(regexp="PLAIN|PREMIUM") String paper, @NotNull Boolean lamination,
        @NotNull LocalDate dueDate, @NotNull UUID requestId) {}
    record Transition(@NotNull @Pattern(regexp="DESIGN|PRINTING|LAMINATION|READY|DELIVERED|CANCELLED") String status,
        @NotNull @PositiveOrZero Integer version) {}
    record PaymentInput(@NotNull @Min(1) @Max(1000000000) Long amountCents,
        @NotNull @Pattern(regexp="CASH|BANK|OTHER") String method, @Size(max=100) String reference, @NotNull UUID requestId) {}
    record ServiceInput(@NotBlank @Size(max=80) String name, @NotBlank @Size(max=300) String description,
        @NotNull @Min(1) @Max(5000000) Long unitPriceCents, @NotNull Boolean active,
        @PositiveOrZero Integer version) {}

    @PostConstruct void initialize() {
        db.execute("PRAGMA journal_mode=WAL"); db.execute("PRAGMA busy_timeout=5000");
        Integer version = db.queryForObject("PRAGMA user_version", Integer.class);
        if (version != null && version > 2) throw new IllegalStateException("Database schema is newer than this application.");
        db.execute("""
            CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
              email TEXT NOT NULL COLLATE NOCASE UNIQUE, phone TEXT NOT NULL, company TEXT NOT NULL DEFAULT '')
            """);
        db.execute("""
            CREATE TABLE IF NOT EXISTS services(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
              unit_price INTEGER NOT NULL CHECK(unit_price>0))
            """);
        db.execute("""
            CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id),
              title TEXT NOT NULL, service_id INTEGER NOT NULL REFERENCES services(id), quantity INTEGER NOT NULL CHECK(quantity>0),
              paper TEXT NOT NULL, lamination INTEGER NOT NULL, due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'NEW',
              total INTEGER NOT NULL CHECK(total>0), created_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0)
            """);
        db.execute("""
            CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id),
              amount INTEGER NOT NULL CHECK(amount>0), method TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)
            """);
        db.execute("""
            CREATE TABLE IF NOT EXISTS requests(request_id TEXT PRIMARY KEY, kind TEXT NOT NULL, fingerprint TEXT NOT NULL, resource_id INTEGER NOT NULL)
            """);
        db.execute("CREATE INDEX IF NOT EXISTS orders_status_due ON orders(status,due_date)");
        db.execute("CREATE INDEX IF NOT EXISTS payments_order ON payments(order_id)");
        addColumn("services","active","INTEGER NOT NULL DEFAULT 1");
        addColumn("services","version","INTEGER NOT NULL DEFAULT 0");
        addColumn("orders","service_name","TEXT");
        db.update("UPDATE orders SET service_name=(SELECT name FROM services WHERE services.id=orders.service_id) WHERE service_name IS NULL");
        db.execute("CREATE UNIQUE INDEX IF NOT EXISTS service_name_unique ON services(lower(name))");
        db.execute("PRAGMA user_version=2");
        db.update("INSERT OR IGNORE INTO services(id,name,description,unit_price) VALUES(1,'Business cards','Double-sided cards, trimmed and boxed.',1500)");
        db.update("INSERT OR IGNORE INTO services(id,name,description,unit_price) VALUES(2,'Flyers','Full-color promotional sheets.',3500)");
        db.update("INSERT OR IGNORE INTO services(id,name,description,unit_price) VALUES(3,'Brochures','Folded promotional brochures.',8500)");
        db.update("INSERT OR IGNORE INTO services(id,name,description,unit_price) VALUES(4,'Posters','Large-format display prints.',25000)");
        db.update("INSERT OR IGNORE INTO customers(id,name,email,phone,company) VALUES(1,'Alex Morgan','alex@example.com','+00 000 0001','North Studio')");
        db.update("INSERT OR IGNORE INTO customers(id,name,email,phone,company) VALUES(2,'Taylor Jordan','taylor@example.com','+00 000 0002','Maple Cafe')");
        db.update("INSERT OR IGNORE INTO customers(id,name,email,phone,company) VALUES(3,'Casey Lee','casey@example.com','+00 000 0003','Paper Club')");
    }

    List<Map<String,Object>> customers() {
        return db.queryForList("SELECT id,name,email,phone,company FROM customers ORDER BY name COLLATE NOCASE");
    }
    @Transactional Map<String,Object> addCustomer(CustomerInput input) {
        String name = clean(input.name(), "Name");
        String email = input.email().trim().toLowerCase(Locale.ROOT);
        if (db.queryForObject("SELECT COUNT(*) FROM customers WHERE email=?",Integer.class,email)>0)
            throw new ResponseStatusException(CONFLICT,"A customer with that email already exists.");
        db.update("INSERT INTO customers(name,email,phone,company) VALUES(?,?,?,?)",name,email,input.phone().trim(),clean(input.company(),"Company"));
        long id = lastId();
        return db.queryForMap("SELECT id,name,email,phone,company FROM customers WHERE id=?",id);
    }
    List<Map<String,Object>> services() {
        return db.queryForList("SELECT id,name,description,unit_price AS unitPriceCents,active,version FROM services ORDER BY id")
            .stream().map(row->{row.put("active",((Number)row.get("active")).intValue()!=0);return row;}).toList();
    }
    private void addColumn(String table,String column,String definition) {
        if(db.queryForList("PRAGMA table_info("+table+")").stream().noneMatch(row->column.equals(row.get("name"))))
            db.execute("ALTER TABLE "+table+" ADD COLUMN "+column+" "+definition);
    }
    private Map<String,Object> service(long id) {
        return services().stream().filter(row->((Number)row.get("id")).longValue()==id).findFirst()
            .orElseThrow(()->new ResponseStatusException(NOT_FOUND,"Catalog service not found."));
    }
    @Transactional Map<String,Object> createService(ServiceInput input) {
        checkServiceName(input.name(),0);
        db.update("INSERT INTO services(name,description,unit_price,active) VALUES(?,?,?,?)",clean(input.name(),"Name"),
            clean(input.description(),"Description"),input.unitPriceCents(),input.active()?1:0);
        return service(lastId());
    }
    @Transactional Map<String,Object> updateService(long id,ServiceInput input) {
        service(id);
        checkServiceName(input.name(),id);
        if(input.version()==null) throw new ResponseStatusException(BAD_REQUEST,"A catalog version is required when editing.");
        if(db.update("UPDATE services SET name=?,description=?,unit_price=?,active=?,version=version+1 WHERE id=? AND version=?",
            clean(input.name(),"Name"),clean(input.description(),"Description"),input.unitPriceCents(),input.active()?1:0,id,input.version())!=1)
            throw new ResponseStatusException(CONFLICT,"This catalog entry changed. Refresh before editing again.");
        return service(id);
    }
    private void checkServiceName(String name,long excludedId) {
        if(db.queryForObject("SELECT COUNT(*) FROM services WHERE lower(name)=lower(?) AND id<>?",Integer.class,name.trim(),excludedId)>0)
            throw new ResponseStatusException(CONFLICT,"A catalog service with that name already exists.");
    }
    Map<String,Object> quote(QuoteInput input) {
        List<Long> prices = db.queryForList("SELECT unit_price FROM services WHERE id=? AND active=1",Long.class,input.serviceId());
        if (prices.isEmpty()) throw new ResponseStatusException(BAD_REQUEST,"Choose an available print service.");
        long unit = prices.get(0);
        if ("PREMIUM".equals(input.paper())) unit = (unit * 120 + 99) / 100;
        if (input.lamination()) unit += 2000;
        long total = Math.multiplyExact(unit, input.quantity());
        if (total>1_000_000_000L) throw new ResponseStatusException(BAD_REQUEST,"The quote exceeds the supported demo amount.");
        return Map.of("unitPriceCents",unit,"totalCents",total);
    }
    private static final String ORDER_SELECT = """
        SELECT o.id,o.customer_id AS customerId,c.name AS customerName,o.title,o.service_id AS serviceId,COALESCE(o.service_name,s.name) AS serviceName,
          o.quantity,o.paper,o.lamination,o.due_date AS dueDate,o.status,o.total AS totalCents,o.created_at AS createdAt,
          o.version,COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id=o.id),0) AS paidCents
        FROM orders o JOIN customers c ON c.id=o.customer_id JOIN services s ON s.id=o.service_id
        """;
    private Map<String,Object> enrich(Map<String,Object> row) {
        row.put("reference",String.format("PF-%05d",((Number)row.get("id")).longValue()));
        row.put("lamination",((Number)row.get("lamination")).intValue()!=0);
        long total=((Number)row.get("totalCents")).longValue(), paid=((Number)row.get("paidCents")).longValue();
        row.put("balanceCents","CANCELLED".equals(row.get("status"))?0:total-paid);
        return row;
    }
    List<Map<String,Object>> orders() { return db.queryForList(ORDER_SELECT+" ORDER BY o.id DESC").stream().map(this::enrich).toList(); }
    Map<String,Object> order(long id) {
        List<Map<String,Object>> rows = db.queryForList(ORDER_SELECT+" WHERE o.id=?",id);
        if(rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND,"Order not found.");
        return enrich(rows.get(0));
    }
    @Transactional Map<String,Object> createOrder(OrderInput input) {
        String fingerprint = fingerprint(input);
        Long previous = existingRequest(input.requestId(),"order",fingerprint);
        if(previous!=null) return order(previous);
        if (input.dueDate().isBefore(LocalDate.now()) || input.dueDate().isAfter(LocalDate.now().plusYears(2)))
            throw new ResponseStatusException(BAD_REQUEST,"Due date must be today or within the next two years.");
        if (db.queryForObject("SELECT COUNT(*) FROM customers WHERE id=?",Integer.class,input.customerId())!=1)
            throw new ResponseStatusException(BAD_REQUEST,"Choose an existing customer.");
        long total = ((Number)quote(new QuoteInput(input.serviceId(),input.quantity(),input.paper(),input.lamination())).get("totalCents")).longValue();
        db.update("INSERT INTO orders(customer_id,title,service_id,quantity,paper,lamination,due_date,total,created_at,service_name) VALUES(?,?,?,?,?,?,?,?,?,?)",
            input.customerId(),clean(input.title(),"Title"),input.serviceId(),input.quantity(),input.paper(),input.lamination()?1:0,
            input.dueDate().toString(),total,Instant.now().toString(),service(input.serviceId()).get("name"));
        long id=lastId(); remember(input.requestId(),"order",fingerprint,id); return order(id);
    }
    @Transactional Map<String,Object> transition(long id, Transition input) {
        Map<String,Object> current=order(id);
        String status=(String)current.get("status");
        String next=switch(status) {
            case "NEW" -> "DESIGN"; case "DESIGN" -> "PRINTING";
            case "PRINTING" -> Boolean.TRUE.equals(current.get("lamination"))?"LAMINATION":"READY";
            case "LAMINATION" -> "READY"; case "READY" -> "DELIVERED"; default -> "";
        };
        boolean cancel="CANCELLED".equals(input.status()) && Set.of("NEW","DESIGN").contains(status);
        if(!cancel && !next.equals(input.status())) throw new ResponseStatusException(CONFLICT,"That production transition is not available.");
        if(cancel && ((Number)current.get("paidCents")).longValue()>0)
            throw new ResponseStatusException(CONFLICT,"Orders with recorded payments cannot be cancelled in this demo.");
        int changed=db.update("UPDATE orders SET status=?,version=version+1 WHERE id=? AND version=?",input.status(),id,input.version());
        if(changed!=1) throw new ResponseStatusException(CONFLICT,"This order changed in another window. Refresh it before trying again.");
        return order(id);
    }
    List<Map<String,Object>> payments() {
        var result=db.queryForList("""
            SELECT p.id,p.order_id AS orderId,c.name AS customerName,p.amount AS amountCents,p.method,p.reference,p.created_at AS createdAt
            FROM payments p JOIN orders o ON o.id=p.order_id JOIN customers c ON c.id=o.customer_id ORDER BY p.id DESC
            """);
        result.forEach(row->row.put("orderReference",String.format("PF-%05d",((Number)row.get("orderId")).longValue())));
        return result;
    }
    record PaymentFingerprint(long orderId, PaymentInput input) {}
    @Transactional Map<String,Object> addPayment(long id, PaymentInput input) {
        String fingerprint=fingerprint(new PaymentFingerprint(id,input));
        Long previous=existingRequest(input.requestId(),"payment",fingerprint);
        if(previous!=null) return order(id);
        Map<String,Object> current=order(id);
        if("CANCELLED".equals(current.get("status"))) throw new ResponseStatusException(CONFLICT,"Cancelled orders cannot receive payments.");
        long balance=((Number)current.get("balanceCents")).longValue();
        if(input.amountCents()>balance) throw new ResponseStatusException(BAD_REQUEST,"The payment exceeds the outstanding balance.");
        db.update("INSERT INTO payments(order_id,amount,method,reference,created_at) VALUES(?,?,?,?,?)",id,input.amountCents(),input.method(),
            clean(input.reference(),"Reference"),Instant.now().toString());
        remember(input.requestId(),"payment",fingerprint,lastId()); return order(id);
    }
    Map<String,Object> dashboard() {
        var orders=orders();
        long revenue=db.queryForObject("SELECT COALESCE(SUM(amount),0) FROM payments",Long.class);
        long outstanding=orders.stream().filter(o->!"CANCELLED".equals(o.get("status"))).mapToLong(o->((Number)o.get("balanceCents")).longValue()).sum();
        Map<String,Long> counts=new LinkedHashMap<>();
        for(String status:List.of("NEW","DESIGN","PRINTING","LAMINATION","READY","DELIVERED","CANCELLED"))
            counts.put(status,orders.stream().filter(o->status.equals(o.get("status"))).count());
        return Map.of("activeOrders",orders.stream().filter(o->!Set.of("DELIVERED","CANCELLED").contains(o.get("status"))).count(),
            "readyOrders",counts.get("READY"),"totalRevenueCents",revenue,"outstandingCents",outstanding,
            "customerCount",customers().size(),"recentOrders",orders.stream().limit(5).toList(),"statusCounts",counts);
    }
    private long lastId() { return db.queryForObject("SELECT last_insert_rowid()",Long.class); }
    private String clean(String input,String field) {
        if(input==null) return "";
        String value=input.trim();
        if(value.chars().anyMatch(c->Character.isISOControl(c))) throw new ResponseStatusException(BAD_REQUEST,field+" contains invalid characters.");
        if(Set.of("Name","Title").contains(field) && value.isEmpty()) throw new ResponseStatusException(BAD_REQUEST,field+" is required.");
        return value;
    }
    private String fingerprint(Object input) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(input))); }
        catch(Exception ex) { throw new IllegalStateException("Cannot encode request.",ex); }
    }
    private Long existingRequest(UUID id,String kind,String fingerprint) {
        var found=db.queryForList("SELECT kind,fingerprint,resource_id FROM requests WHERE request_id=?",id.toString());
        if(found.isEmpty()) return null;
        var row=found.get(0);
        if(!kind.equals(row.get("kind")) || !fingerprint.equals(row.get("fingerprint")))
            throw new ResponseStatusException(CONFLICT,"This request ID was already used for different data. Refresh before creating another request.");
        return ((Number)row.get("resource_id")).longValue();
    }
    private void remember(UUID id,String kind,String fingerprint,long resource) {
        db.update("INSERT INTO requests VALUES(?,?,?,?)",id.toString(),kind,fingerprint,resource);
    }
}
