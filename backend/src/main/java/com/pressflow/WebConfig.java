package com.pressflow;

import java.nio.file.Path;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;
import org.springframework.web.servlet.HandlerInterceptor;
import jakarta.servlet.http.*;

@Configuration
class WebConfig implements WebMvcConfigurer {
    @Override public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path frontend=Path.of(System.getenv().getOrDefault("PRESSFLOW_FRONTEND","../frontend/dist")).toAbsolutePath().normalize();
        registry.addResourceHandler("/**").addResourceLocations(frontend.toUri().toString()+"/");
    }
    @Override public void addViewControllers(ViewControllerRegistry registry) { registry.addViewController("/").setViewName("forward:/index.html"); }
    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override public boolean preHandle(HttpServletRequest request,HttpServletResponse response,Object handler) {
                if(request.getRequestURI().startsWith("/api/")) response.setHeader("Cache-Control","no-store");
                return true;
            }
        });
    }
}
