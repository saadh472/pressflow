package com.pressflow;

import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
class StudioController {
    private final StudioService service;
    StudioController(StudioService service) { this.service=service; }
    @GetMapping("/health") Map<String,String> health() { return Map.of("status","ok","application","pressflow"); }
    @GetMapping("/customers") List<Map<String,Object>> customers() { return service.customers(); }
    @PostMapping("/customers") @ResponseStatus(HttpStatus.CREATED)
    Map<String,Object> customer(@Valid @RequestBody StudioService.CustomerInput input) { return service.addCustomer(input); }
    @GetMapping("/services") List<Map<String,Object>> services() { return service.services(); }
    @PostMapping("/services") @ResponseStatus(HttpStatus.CREATED)
    Map<String,Object> createService(@Valid @RequestBody StudioService.ServiceInput input) { return service.createService(input); }
    @PutMapping("/services/{id}")
    Map<String,Object> updateService(@PathVariable long id,@Valid @RequestBody StudioService.ServiceInput input) { return service.updateService(id,input); }
    @PostMapping("/quote") Map<String,Object> quote(@Valid @RequestBody StudioService.QuoteInput input) { return service.quote(input); }
    @GetMapping("/orders") List<Map<String,Object>> orders() { return service.orders(); }
    @GetMapping("/orders/{id}") Map<String,Object> order(@PathVariable long id) { return service.order(id); }
    @PostMapping("/orders") @ResponseStatus(HttpStatus.CREATED)
    Map<String,Object> order(@Valid @RequestBody StudioService.OrderInput input) { return service.createOrder(input); }
    @PostMapping("/orders/{id}/transition")
    Map<String,Object> transition(@PathVariable long id,@Valid @RequestBody StudioService.Transition input) { return service.transition(id,input); }
    @GetMapping("/payments") List<Map<String,Object>> payments() { return service.payments(); }
    @PostMapping("/orders/{id}/payments") @ResponseStatus(HttpStatus.CREATED)
    Map<String,Object> payment(@PathVariable long id,@Valid @RequestBody StudioService.PaymentInput input) { return service.addPayment(id,input); }
    @GetMapping("/dashboard") Map<String,Object> dashboard() { return service.dashboard(); }
}
